module.exports = {
  // could call some filters by default in afterConstruct,
  // or call addFilter in construct
  construct: function(self, options) {
    self.addFilter('geo', {
      set: function(geo) {
        if (geo) {
          self.set('geo', geo);
          // Limitation of MongoDB: $near cannot be combined with $text. If text search
          // is used in this query, make sure it's a dumbed-down regex search
          self.set('regexSearch', true);
        }
      },
      finalize: function() {
        var geo = self.get('geo');
        if (!geo) {
          return;
        }
        var near = {
          $geometry: geo
        };
        var maxDistance;
        if (self.get('maxDistance')) {
          maxDistance = self.get('maxDistance');
        } else if (self.get('maxKm')) {
          maxDistance = self.get('maxKm') * 1000;
        } else if (self.get('maxMiles')) {
          maxDistance = self.get('maxMiles') * 1609.34;
        }
        if (maxDistance) {
          near.$maxDistance = maxDistance;
        }
        var criteria = {
          geo: { $near: near }
        };
        // Combining $near and $and is not allowed
        self.addLateCriteria(criteria);
        // Kill any other sort when distance is in play, otherwise the implicit sort of $near can't be
        // specified at all, in most cases rendering this feature useless. We want to both override
        // the filter's setting and, in case the other guy finalized first, override the sortMongo
        // property that gets used for the real call to mongodb sort()
        self.sort(false);
        self.set('sortMongo', false);
      }
    });
    self.addFilter('maxDistance', {});
    self.addFilter('maxKm', {});
    self.addFilter('maxMiles', {});
  }
};
