var _ = require('lodash')
  , async = require('async');

// The `apostrophe-places` module provides map locations (pieces with geolocation).
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
// `geocoder`: passed on directly to the `apostrophe-places-geocoder` instance (or the
// subclass corresponding to your subclass), which in turn passes them on to the `node-geocoder`
// npm module.

module.exports = {
  name: 'apostrophe-place',
  alias: 'places',
  label: 'Place',
  extend: 'apostrophe-pieces',

  map: {
    browser: {
      // Hey, you have to configure me or it'll fail in production!
      // Yes really
      key: null
    }
  },

  moogBundle: {
    modules: ['apostrophe-places-pages', 'apostrophe-places-widgets'],
    directory: 'lib/modules'
  },

  afterConstruct: function(self, callback) {

    if (!(self.options && self.options.map && self.options.map.browser && self.options.map.browser.key)) {
      console.error('*** Beginning July 2016 Google REQUIRES an API key for all new domains.');
      console.error('Make sure you get one and configure the "key" options for both the server and');
      console.error('the browser:\n\n');
      console.error(JSON.stringify({
        key: 'your server key here',
        map: {
          browser: {
            key: 'your browser key here'
          }
        }
      } , null, '  '));
      console.error('\n\n');
      console.error('Otherwise it may work in dev & staging but WILL FAIL in production.');
    }

    self.pushAsset('script', 'always', { when: 'always' });
    self.pushAsset('stylesheet', 'map', { when: 'always' });

    var tools = [ 'map' ];
    _.each(tools, function(tool) {
      self.apos.push.browserMirrorCall('always', self, { 'tool': tool, stop: 'apostrophe-places' });
      var _options = (self.options && self.options[tool] && self.options[tool].browser) || {};

      // Otherwise there's really only one when multiple subclasses are
      // in play. TODO consider whether this makes self-documenting
      // options a bad idea when they are objects

      _options = _.cloneDeep(_options);
      _.defaults(_options, {
        name: self.__meta.name
      });

      self.apos.push.browserCall('always', 'apos.create(? + "-" + ?, ?)', self.__meta.name, tool, _options);
    });

    // Set up our route for serving
    self.apos.app.post(self.action + '/infoBox', function(req, res) {
      return res.send(self.render(req, '_infoBox', { item: req.body }));
    });
    
    return async.series([
      self.ensureIndex,
      self.enableGeocoder
    ], callback);
  },

  beforeConstruct: function(self, options) {
    options.sort = { title: 1 };

    options.addFields = [
      {
        name: 'address',
        label: 'Address',
        type: 'string',
        help: 'Must be a complete address unless latitude and longitude are specified.'
      },
      {
        name: 'lat',
        label: 'Latitude',
        type: 'float',
        help: 'If omitted, the address will be looked up for you. West longitudes are negative.'
      },
      {
        name: 'lng',
        label: 'Longitude',
        type: 'float',
        help: 'If omitted, the address will be looked up for you. North latitudes are positive.'
      },
    ].concat(options.addFields || []);

    options.arrangeFields = _.merge([
      { name: 'basic', label: 'Basics', fields: ['title', 'slug', 'address'] },
    ], options.arrangeFields || []);

    options.mapInfoBoxFields = _.union(['_id', 'slug', 'title', 'tags', 'address', 'url', 'geo'], options.mapInfoBoxFields || []);
  },

  construct: function(self, options) {
    var superFind = self.find;

    self.addHelpers({
      pruneMapLocations: self.pruneMapLocations
    });

    self.pruneMapLocations = function(items) {
      var result = _.map(items, function(item) {
        return _.pick(item, options.mapInfoBoxFields);
      });

      return result;
    };

    // limit the results of autocomplete for joins
    // so they only include
    self.extendAutocompleteCursor = function(cursor) {
      // return cursor.upcoming(true);
    };

    if(!options.key) {
      console.log('WARNING: You need to provide a Google maps API key in your options in order for this module to work in the wild');
    }

    self.beforeSave = function(req, piece, options, callback) {
      return self.geocoder.geocodePiece(piece, callback);
    };
    
    // Ensure there is a 2dsphere index for the `geo` property of a doc. Note that this means
    // all docs in a project utilizing this module must use a property named `geo` only for a
    // geoJSON point (if they have such a property at all).

    self.ensureIndex = function(callback) {

      return async.series([
        fixType,
        ensureIndex
      ], callback);

      // Cope with projects where the "type" property of the geo object is somehow missing.
      // Otherwise the index will crash. TODO: consider removing this later, it should never have been
      // necessary. It can't be a migration because of chicken and egg issues.

      function fixType(callback) {
        return self.apos.docs.db.update({
          type: self.name,
          geo: { $type: 3 },
          'geo.type': { $exists: 0 }
        }, {
          $set: {
            'geo.type': 'Point'
          }
        }, {
          multi: true
        },
        callback);
      }

      function ensureIndex(callback) {
        return self.apos.docs.db.ensureIndex({ geo: '2dsphere' }, { safe: true }, callback);
      }

    };
    
    self.defineRelatedType('geocoder', {
      stop: 'apostrophe-module'
    });
    
    // Sets self.geocoder to an instance of `apostrophe-places-geocoder` (or the appropriate subclass for your subclass).
    // Passes on the `rateLimit`, `dailyLimit`, `key` and `name` options, plus all properties of the
    // `geocoder` option if you provide one

    self.enableGeocoder = function(callback) {
      var geocoderOptions = self.options.geocoder || {};
      if (options.rateLimit !== undefined) {
        geocoderOptions.rateLimit = options.rateLimit;
      }
      if (options.dailyLimit !== undefined) {
        geocoderOptions.dailyLimit = options.dailyLimit;
      }
      _.defaults(geocoderOptions, {
        apiKey: options.key || options.apiKey,
        name: self.name,
        apos: self.apos
      });
      return self.createRelatedType('geocoder', geocoderOptions, function(err, geocoder) {
        if (err) {
          return callback(err);
        }
        self.geocoder = geocoder;
        return callback(null);
      });
    };

  }
};
