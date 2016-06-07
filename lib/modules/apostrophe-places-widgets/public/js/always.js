apos.define('apostrophe-places-widgets', {
  extend: 'apostrophe-widgets',
  construct: function(self, options) {

    self.play = function($widget, data, options) {
      // TODO: replace this with browser options peicesModuleName
      apos[self.name.replace(/s+$/, "")].addMap({
        items: data,
        id: 'apostrophe-google-map-widget',
        options: options.mapOptions || {},
        action: self.action
      });
    };
  }
});
