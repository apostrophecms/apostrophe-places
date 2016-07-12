module.exports = {
  name: 'apostrophe-places-page',
  label: 'Places Page',
  extend: 'apostrophe-pieces-pages',

  construct: function(self, options) {
    self.beforeIndex = function(req, callback) {
      req.data.mapId = self.apos.utils.generateId();
      req.browserCall('apos.maps[?].addMap(?)', self.pieces.__meta.name, {
        items: self.pieces.pruneMapLocations(req.data.pieces),
        sel: '#' + req.data.mapId,
        options: self.pieces.options.mapOptions || {},
        action: self.pieces.action
      });
      return callback(null);
    }
  }
};
