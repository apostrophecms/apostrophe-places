module.exports = {
  label: 'Places Widget',
  extend: 'apostrophe-pieces-widgets',
  browser: {
    mapOptions: {}
  },

  construct: function(self, options) {

    // By default, the data attribute of a widget does not contain joins or other
    // large dynamic data. It only contains what is needed for editing.
    //
    // But in this case, we need the `_pieces` property to render the map.
    //
    // We still don't recurse down into things that `_pieces` joins with. If
    // you really want to do that (at a cost in performance), you can
    // override the method at project level.

    self.filterForDataAttribute = function(widget) {
      var result = self.apos.utils.clonePermanent(widget);
      result._pieces = self.apos.utils.clonePermanent(widget._pieces);
      return result;
    };
  }
};
