apos.define('apostrophe-places-widgets', {
  extend: 'apostrophe-widgets',
  construct: function(self, options) {
    self.play = function($widget, data, options) {
      // fetch the pieces
      var widgetData = $widget.find('#apostrophe-google-map-widget').attr('data-widget');
      var items = [];
      try {
        items = JSON.parse(widgetData)._pieces;
      } catch (e) {
        console.log('Error parsing widget map data', e);
      }

      // initiate the addMap method of the pieces parent
      apos[self.options.mapModuleName || self.options.piecesModuleName].addMap({
        items: items,
        id: 'apostrophe-google-map-widget',
        options: self.options.mapOptions || {},
        action: self.action
      });
    };
  }
});
