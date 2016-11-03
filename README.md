# apostrophe-places

0.6

This module's API is not finalized but it is seeing production use. It provides a piece type for geographical places,
a corresponding widget type, and pieces pages that provide maps.

For new sites you MUST obtain a Google Maps JavaScript API key with Google Maps Geolocation API enabled for both the server and the browser and configure the module accordingly:

```javascript
{
  key: 'your server key here',
  map: {
    browser: {
      key: 'your browser key here'
    }
  }
}
```

This module introduces a 2dsphere index on the `geo` property of `aposDocs`. Your other docs must either use that property to store a GeoJSON point, or have no such property.

A `geo()` filter is available on the cursors returned by the `find` method of `apostrophe-places`. This filter accepts a GeoJSON point and sorts results by distance from that point.

You may combine it with the `maxDistance` (in meters), `maxKm` and/or `maxMiles` filters.

Hint: pass it the `geo` property of a place and you'll get back other places sorted by distance. You'll want to exclude the original place from that list via criteria like `{ _id: { $ne: req.data.piece._id }}`.

When `geo()` is invoked, distance becomes the sort order, overriding all other sorts. If `geo()` is present, `search()` for text is still allowed but a simplified regex search is used to work around the limitations of MongoDB.
