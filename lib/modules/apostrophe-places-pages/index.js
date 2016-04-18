module.exports = {
  name: 'apostrophe-places-page',
  label: 'Places Page',
  extend: 'apostrophe-pieces-pages',
  
  construct: function(self, options) {    
    self.apos.push.browserCall('always', 'apos.create("apostrophe-places-map")');

    self.beforeIndex = function(req, callback) {
      req.browserCall('apos.places.addMap(?)', {
        items: self.pieces.pruneMapLocations(req.data.pieces), 
        id: 'apostrophe-google-map', 
        options: self.pieces.options.mapOptions || {}
      });

      return callback(null);
    }

    // var superIndexCursor = self.indexCursor;
    // self.indexCursor = function(req) {
    //   // return superIndexCursor(req).upcoming(true);
    // };
  }
};