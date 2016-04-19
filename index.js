var _ = require('lodash')
  , async = require('async')
  , geocoder = require('./lib/geocoder');

module.exports = {
  name: 'apostrophe-place',
  alias: 'places',
  label: 'Place',
  extend: 'apostrophe-pieces',
  
  moogBundle: {
    modules: ['apostrophe-places-pages', 'apostrophe-places-widgets'],
    directory: 'lib/modules'
  },

  afterConstruct: function(self) {
    self.pushAsset('script', 'always', { when: 'always' });
    self.pushAsset('stylesheet', 'map', { when: 'always' });

    // Set up our route for serving
    self.apos.app.post('/infoBox', function(req, res) {
      return res.send(self.render(req, '_infoBox', { item: req.body }));
    });
  },

  beforeConstruct: function(self, options) {
    options.sort = { title: 1 };

    options.addFields = [
      {
        name: 'address',
        label: 'Address',
        type: 'string'
      }
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

    self.find = function(req, criteria, projection) {
      var cursor = superFind(req, criteria, projection);
      require('./lib/cursor')(self, cursor);
      return cursor;
    };

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

    self.geocoder = geocoder({
      rateLimit: options.rateLimit,
      dailyLimit: options.dailyLimit,
      instance: self.name,
      apos: self.apos
    });

    self.beforeSave = function(req, piece, callback) {
      return self.geocoder.geocodePiece(piece, true, callback);
    };
  }
};