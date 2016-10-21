var nodeGeocoder = require('node-geocoder')
  , async = require('async')
  , moment = require('moment');

module.exports = function(options) {
  return new Geocoder(options);
};

function Geocoder(options) {
  var self = this;

  self.nodeGeocoder = nodeGeocoder(options || {});

  // Google's standard free limits
  self.dailyLimit = options.dailyLimit || 2500;
  self.rateLimit = options.rateLimit || 10;
  self.apiKey = options.apiKey;

  self.instance = options.instance;
  self.apos = options.apos;

  // Initialize a mongo collection to keep record of how many times we've
  // hit the google maps api and make sure there is a document present

  self.initializeLimitCollection = function(callback) {
    self.apos.db.collection('aposGeocoderLimits', function(err, collection) {
      if(err) {
        return callback(err);
      }

      self.limitCollection = collection;

      return collection.findOne({}, function(err, doc) {
        if(!doc) {
          return collection.insert({
            requestsToday: 0,
            requestsThisSecond: 0
          }, callback);
        }

        return callback(null);
      });
    });    
  }

  self.limit = function(callback) {
    self.limitCollection.findOne({}, function(err, doc) {
      if(err) {
        return callback(err);
      }

      if(!doc) {
        return callback('No limit collection found.');
      }

      var now = new Date();

      // console.log(now - doc.lastRequest);
      // console.log(moment(now).diff(moment(doc.lastRequest)));

      if(doc.requestsThisSecond >= self.rateLimit || doc.requestsToday >= self.dailyLimit) {
        // we're currently maxed out
        return false;
      }

      return self.limitCollection.update({ _id: doc._id }, { 
        $inc: { requestsThisSecond: 1, requestsToday: 1 },
        $currentDate: { lastRequest: true }
      }, callback);
    });
  }


  // Strategy: wake up once a second, look for ungeocoded addresses, pull
  // as many as the rate limit allows per second and then use RateLimiter
  // to ensure we don't go faster than the daily and per-second rate limits
  // of Google's API permit.

  self.geocodePass = function() {
    // Make sure an address exists, otherwise the geocode module will complain in a way
    // that sticks us in a loop trying again with that bad location forever
    return self.apos.docs.db.find({ type: self.instance, address: { $exists: true, $ne: '' }, geoInvalidAddress: { $ne: true }, $or: [{ geo: { $exists: false }}, { geo: null } ] },
      { title: 1, address: 1 }).limit(self.rateLimit).toArray(function(err, pieces) {
      // Use eachSeries to avoid parallelism, the rate limiter below should in theory
      // make this not a problem but I've seen Google get grumpy.
      return async.eachSeries(pieces || [], geocodePiece, function(err) {
        // Don't invoke passes so ferociously often, and introduce randomness to deal more gracefully
        // with situations where many Apostrophe instances are talking to MongoDB
        setTimeout(self.geocodePass, 10000 + Math.random() * 5000);
      });

      function geocodePiece(piece, callback) {
        // Use rate limiter to avoid getting shut down by Google during large imports.
        // This still won't help you if you hit the per-day limit (2,000+), we would
        // have to resolve that with something in the background
        return self.limit(function() {
          return self.geocodePiece(piece, true, callback);
        });
      }
    });
  };

  // Available to be called individually, for instance for manual edits where
  // it is unlikely the rate limit will be reached
  self.geocodePiece = function(piece, saveNow, callback) {
    return async.series({
      geocode: function(callback) {
        // If a manually entered location is present, let it win
        if ((typeof(piece.lat) === 'number') && (typeof(piece.lng) === 'number')) {
          piece.geoInvalidAddress = false;
          piece.geo = {
            type: 'Point',
            coordinates: [ piece.lng, piece.lat ]
          };
          return callback(null);
        }

        return self.nodeGeocoder.geocode(piece.address, function(err, geo) {
          if(err) {
            console.log('NODEGEOCODER ERROR: ');
            console.log(err);
            return callback(err);
          }

          if(!geo) {
            console.log('NODEGEOCODER ERROR: ');
            console.log('Invalid Response');
            return callback(new Error('Invalid Response'));
          }

          if(!geo.length) {
            console.log('NODEGEOCODER ERROR: ');
            console.log('Location not found');
            return callback(new Error('Location not found'));            
          }

          var location = geo[0];
          piece.geo = {
            type: 'Point',
            coordinates: [ location.longitude, location.latitude ]
          };

          piece.geoInvalidAddress = false;

          return callback(null);
        });
      },
      save: function(callback) {
        if (saveNow) {
          self.apos.docs.db.update(
            { _id: piece._id }, { 
              $set: { 
                geo: piece.geo,
                geoInvalidAddress: piece.geoInvalidAddress
              }
            }, function(err) {
            // If it didn't work, it'll come up in the next query,
            // no need to report the error now
            return callback(null);
          });
        } else {
          return callback(null);
        }
      }
    }, callback);
  };

  // Initialize the collection and then start the geocode passes
  return self.initializeLimitCollection(function(err) {
    if(err) {
      console.error('There was a problem initializing the aposGeocoderLimits collection:')
      console.error(err);
    }

    return self.geocodePass();
  });
}