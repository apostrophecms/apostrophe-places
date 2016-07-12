apos.define('apostrophe-places-widgets', {
  extend: 'apostrophe-widgets',
  construct: function(self, options) {
    self.play = function($widget, data, options) {
      // fetch the pieces
      var items = data._pieces || [];

      var _options = _.cloneDeep(self.options.mapOptions || {});
      _.merge(_.options, options || {});

      // initiate the addMap method of the pieces parent
      apos.maps[self.options.piecesModuleName].addMap({
        items: items,
        sel: $widget.find('[data-map]:first'),
        options: _options,
        action: '/modules/' + self.options.piecesModuleName
      });
    };
  }
});
