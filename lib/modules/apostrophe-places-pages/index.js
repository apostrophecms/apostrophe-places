module.exports = {
  name: 'apostrophe-places-page',
  label: 'Places Page',
  extend: 'apostrophe-places-pages',

  construct: function(self, options) {
    var superIndexCursor = self.indexCursor;
    self.indexCursor = function(req) {
      // return superIndexCursor(req).upcoming(true);
    };
  }
};