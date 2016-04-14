module.exports = {
  label: 'Places Widget',
  extend: 'apostrophe-pieces-widgets',

  construct: function(self, options) {
    var superWidgetCursor = self.widgetCursor;
    self.widgetCursor = function(req, criteria) {

    };
  }
}