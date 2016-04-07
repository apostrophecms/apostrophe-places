module.exports = {
  name: 'apostrophe-places-widget',
  label: 'Places Widget',
  extend: 'apostrophe-places-widgets',

  construct: function(self, options) {
    var superWidgetCursor = self.widgetCursor;
    self.widgetCursor = function(req, criteria) {

    };
  }
}