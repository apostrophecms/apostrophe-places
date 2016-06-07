module.exports = {
  name: 'apostrophe-places-page',
  label: 'Places Page',
  extend: 'apostrophe-pieces-pages',

  construct: function(self, options) {
    self.beforeIndex = function(req, callback) {
      req.browserCall('apos[?].addMap(?)', self.pieces.__meta.name, {
        items: self.pieces.pruneMapLocations(req.data.pieces),
        id: 'apostrophe-google-map',
        options: self.pieces.options.mapOptions || {},
        action: self.pieces.action
      });
      return callback(null);
    }
  }
};
