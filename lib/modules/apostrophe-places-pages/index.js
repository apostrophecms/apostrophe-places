module.exports = {
  name: 'apostrophe-places-page',
  label: 'Places Page',
  extend: 'apostrophe-pieces-pages',

  construct: function(self, options) {
    var superBeforeIndex = self.beforeIndex;
    self.beforeIndex = function(req, callback) {
      return superBeforeIndex(req, function(err) {
        if (err) {
          return callback(err);
        }
        // There can be only one! This simplifies
        // repeating the call if necessary after an
        // AJAX refresh via apos.maps.recreatePageSingletonMap()
        req.data.mapId = 'page-singleton-map';
        req.browserCall('apos.maps[?].addMap(?)', self.pieces.__meta.name, {
          items: self.pieces.pruneMapLocations(req.data.pieces),
          sel: '#' + req.data.mapId,
          _id: req.data.mapId,
          options: self.pieces.options.mapOptions || {},
          action: self.pieces.action,
          pageSingletonMap: true
        });
        return callback(null);
      });
    };
  }
};
