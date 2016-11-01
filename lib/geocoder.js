var nodeGeocoder = require('node-geocoder')
  , async = require('async')
  , moment = require('moment');

// A geocoding service for apostrophe-places. Geocodes addresses in the background, populating `geo` properties
// based on `address` properties and respecting rate limits. You can also manually geocode standalone addresses or
// pieces.
//
// ### options
//
// `dailyLimit`: defaults to `2500`, Google's free limit
//
// `rateLimit`: defaults to `10` (per second), Google's free limit
//
// `apiKey`: MUST be provided. Google will not geocode for new domains without one
//
// `cacheLifetime`: how long to cache coordinates corresponding to addresses, in seconds.
// Defaults to `86400` (one day). Street addresses don't move around much.
//
// In addition, all options are passed on to the `node-geocoder` module.

module.exports = {

  // Google's free limits:
  // Per day
  dailyLimit: 20,

  // per second
  rateLimit: 10,
  
  // You must set an apiKey for new sites!
  apiKey: false,

  // Cache addresses for one day so we don't hit nuisance rate limits
  cacheLifetime: 86400,

  afterConstruct: function(self, callback) {
    self.enableCache();
    self.nodeGeocoder = self.getNodeGeocoder(self.options || {});
    return self.enableLimitCollection(function(err) {
      if (err) {
        return callback(err);
      }
      self.scheduleBackgroundCleanup();
      // Start the background "process"
      self.geocodePass();
      return callback(null);
    });
  },

  construct: function(self, options) {
    self.options = options;
    self.dailyLimit = options.dailyLimit;
    self.rateLimit = options.rateLimit;
    self.apiKey = options.apiKey;
    self.cacheLifetime = options.cacheLifetime;
    self.name = options.name;
    self.apos = options.apos;
    

    self.getNodeGeocoder = function(options) {
      return nodeGeocoder(options);
    };

    self.enableCache = function() {
      self.cache = self.apos.caches.get('apostrophe-map-geocoder');    
    };

    self.enableLimitCollection = function(callback) {
      return self.apos.db.collection('aposGeocoderLimits', function(err, collection) {
        if (err) {
          return callback(err);
        }
        self.limitCollection = collection;
        return callback(null);
      });
    };
    
    // A background operation that periodically mops up ancient records in the aposGeocoderLimits collection
    self.backgroundCleanup = function() {
      var when = moment();
      return self.limitCollection.remove({
        queryDate: { $lt: when.format('YYYY-MM-DD') }
      }, function(err) {
        if (err) {
          // Don't stop the world for background cleanup
          console.error(err);
        }
        // Schedule next pass
        self.scheduleBackgroundCleanup();
      });
    };
    
    // Schedule the next timer to clean up the aposGeocoderLimits collection in the background.
    // Once a minute is reasonable
    self.scheduleBackgroundCleanup = function() {
      setTimeout(self.backgroundCleanup, 60000);
    };

    // Strategy: wake up once a second, look for ungeocoded addresses, pull
    // as many as the rate limit allows per second and then use RateLimiter
    // to ensure we don't go faster than the daily and per-second rate limits
    // of Google's API permit.

    self.geocodePass = function() {
      var availableToday;
      var availableNow;
      var when = moment();
      return async.series([
        checkRateLimit,
        checkDailyLimit,
        query
      ], function(err) {
        if (err) {
          // This is a background process, don't stop the world
          console.error(err);
        }
        // Schedule the next
        return later();
      });
      function checkRateLimit(callback) {
        return self.limitCollection.count({ querySecond: when.format('YYYY-MM-DD HH:mm:ss') }, function(err, count) {
          if (err) {
            return callback(err);
          }
          availableNow = self.rateLimit - count;
          if (availableNow <= 0) {
            return later();
          }
          return callback(null);
        });
      }
      function checkDailyLimit(callback) {
        return self.limitCollection.count({ queryDate: when.format('YYYY-MM-DD') }, function(err, count) {
          if (err) {
            return callback(err);
          }
          availableToday = self.dailyLimit - count;
          if (availableToday <= 0) {
            return later();
          }
          return callback(null);
        });
      }
      function query(callback) {
        var available = Math.min(availableToday, availableNow);
        // Make sure an address exists, otherwise the geocode module will complain in a way
        // that sticks us in a loop trying again with that bad location forever
        return self.apos.docs.db.find({
            type: self.name,
            address: { $exists: true, $ne: '' },
            geoInvalidAddress: { $ne: true },
            $or: [
              { geo: { $exists: false } },
              { geo: null }
            ]
         },
         { title: 1, address: 1 }
       ).limit(available).toArray(function(err, pieces) {
         if (err) {
           // mongodb error, this is background work so just log it and try again later
           console.error(err);
           return later();
         }
         // Use eachSeries to avoid parallelism, the rate limiter should in theory
         // make this not a problem but I've seen Google get grumpy.
         return async.eachSeries(pieces || [], geocodeAndUpdatePiece, function(err) {
           if (err) {
             // This is background work, so just log it and try again later
             console.error(err);
           }
           // Don't invoke passes so ferociously often, and introduce randomness to deal more gracefully
           // with situations where many Apostrophe instances are talking to MongoDB
           return later();
         });
       });
      }
    
      function geocodeAndUpdatePiece(piece, callback) {
        return self.geocodePiece(piece, function(err) {
          if (err) {
            // Don't stop the entire background geocoding process
            console.error('geocoder error: ', err);
          }
          return self.apos.docs.db.update({ _id: piece._id }, {
            $set: {
              geo: piece.geo,
              geoInvalidAddress: piece.geoInvalidAddress
            }
          }, callback);
        });
      }
    
      function later() {
        setTimeout(self.geocodePass, 10000 + Math.random() * 5000);
      }
    };

    // Geocode an address now. Callback receives an error if
    // any and a geoJSON point:
    //
    // { type: 'point', coordinates: [ longitude, latitude ] }
    //
    // If there is no match for the address, the error is still `null`,
    // and there is no second argument.
    //
    // Checks the cache first

    self.geocode = function(address, callback) {

      var location;
      
      return self.cache.get(address, function(err, value) {
        if (err) {
          return callback(err);
        }
        if (value) {
          return callback(null, value);
        }
        return fetch();
      });
      
      function fetch() {
        // Immediately note that we used up some of our rate limit. Don't wait for that to complete. -Tom
        limit();
        return self.nodeGeocoder.geocode(address, function(err, geo) {
          if (err) {
            console.error('geocoding error: ', err);
            return callback(err);
          }
          if (!geo) {
            console.error('geocoding problem: invalid response');
            return callback(new Error('Invalid response'));
          }
          if (!geo.length) {
            // No location was found (?)
            return callback(null, null);
          }
          var googlePoint = geo[0];
          location = {
            type: 'Point',
            coordinates: [ googlePoint.longitude, googlePoint.latitude ]
          };
          return insert();
        });
      }

      function limit() {
        // Lack of return statement is intentional, we're just inserting a rate limiter record here, we intentionally
        // continue in parallel. -Tom
        var now = new Date();
        self.limitCollection.insert({ queryDate: moment(now).format('YYYY-MM-DD'), querySecond: moment(now).format('YYYY-MM-DD HH:mm:ss') }, function(err) {
          if (err) {
            console.error(err);
          }
        });
      }

      function insert() {
        return self.cache.set(address, location, self.cacheLifetime, function(err) {
          if (err) {
            return callback(err);
          }
          return callback(null, location);
        });
      }
    };

    // Update the `geo` property of the piece to a new GeoJSON point based on the
    // `address` property, unless `lat` and `lng` properties are present, in which case
    // a point is created directly from `lat` and `lng`. This allows optional manual
    // entry of locations.
    //
    // If the address is invalid, `geoInvalidAddress` is set to true, otherwise
    // false.
    //
    // If a geocoder error occurs, `geo` is set to null, which causes the background
    // geocoder to try again later. `geoInvalidAddress` is also set to false, so you can
    // distinguish this situation from an invalid address. An error is not reported to the
    // callback because geocoder errors are usually transitory and should not flunk
    // operations like inserting a place.
    //
    // The piece is not inserted or updated; that's up to you.

    self.geocodePiece = function(piece, callback) {
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
          return self.geocode(piece.address, function(err, geo) {
            if (err) {
              // Who knows? Usually rate limiting. Hard to tell with an API that makes it
              // hard to catch things with any nuance. Try again later
              piece.geo = null;
              piece.geoInvalidAddress = false;
              return callback(null);
            }
            if (!geo) {
              // Definitive failure for this address
              piece.geoInvalidAddress = true;
              return callback(null);
            }
            // Happiness
            piece.geoInvalidAddress = false;
            piece.geo = geo;
            return callback(null);
          });
        }
      }, callback);
    };

  }
};

