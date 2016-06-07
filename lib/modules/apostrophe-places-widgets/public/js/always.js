apos.define('apostrophe-places-widgets', {
  extend: 'apostrophe-widgets',
  construct: function(self, options) {

    self.play = function($widget, data, options) {
      apos[self.options.piecesModuleName].addMap({
        items: data,
        id: 'apostrophe-google-map-widget',
        options: options.mapOptions || {},
        action: self.action
      });
    };
  }
});
