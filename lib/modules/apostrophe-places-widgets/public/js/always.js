apos.define('apostrophe-places-widgets', {
  extend: 'apostrophe-widgets',
  construct: function(self, options) {
    self.play = function($widget, data, options) {
      // fetch the pieces
      var items = data._pieces || [];

      var _options = _.cloneDeep(self.options.mapOptions || {});
      _.merge(_options, options || {});

      // initiate the addMap method of the pieces parent
      apos.maps[self.options.piecesModuleName].addMap({
        items: items,
        sel: $widget.find('[data-map]:first'),
        options: _options,
        // Widgets should have a unique id but watch out for dodgy imports. -Tom
        _id: data._id || apos.utils.generateId(),
        action: '/modules/' + self.options.piecesModuleName
      });
    };
  }
});
