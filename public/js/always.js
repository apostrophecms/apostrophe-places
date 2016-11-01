apos.define('apostrophe-places-map', {
  extend: 'apostrophe-context',

  afterConstruct: function(self) {
    self.enableInfoBoxClicks();
  },

  construct: function(self, options) {
    self.mapsToLoad = [];
    self.mapsById = {};
    self.googleLoading = false;
    self.googleLoaded = false;

    self.addMap = function(options) {
      // Load Google maps API and extra libraries if needed.
      if(!self.googleLoading) {
        self.mapsToLoad.push(options);
        return self.loadGoogleMapsAndLibraries(function() {
          self.googleLoaded = true;
          self.geocoder = new google.maps.Geocoder();
          return self.initializeMaps();
        });
      }

      // Add map to an array of callbacks to be fired later if
      // API/library loading hasn't finished yet
      if(!self.googleLoaded) {
        self.mapsToLoad.push(options);
      }

      // If the API has loaded, go ahead and initialize
      // the map straight away.
      if(self.googleLoading && self.googleLoaded) {
        self.initializeMap(options);
      }
    }

    self.loadGoogleMapsAndLibraries = function(callback) {
      self.googleLoading = true;
      // Load the Google Maps API and any additional libraries only once
      // console.log('MAPS: Loading google API and libraries');
      return async.series([
        self.loadGoogleMaps,
        self.loadGoogleCodeLibraries,
      ], callback);
    }

    self.initializeMaps = function(callback) {
      // console.log('MAPS: APIs Loaded. Configuring maps.');
      return async.each(self.mapsToLoad, function(map, callback) {
        self.initializeMap(map);
      }, callback);
    }

    self.initializeMap = function(map, callback) {
      /// we start an async series but don't need a final callback
      return async.series([
        function(callback) {
          return self.geocodeAll(map.items, callback);
        },
        function(callback) {
          return self.configureMap(map, callback);
        },
        function(callback) {
          return self.renderItems(map, callback);
        }
      ]);
    };

    self.geocodeAll = function(items, callback) {
      // For points not geocoded server side
      return async.eachSeries(items, self.geocodeOne, callback);
    };

    self.configureMap = function(map, callback) {
      // Make sure we have SOME default 'filterBy' and center point set
      // even though the map will auto-center itself around the markers.
      _.defaults(map.options, {
        infoBox: true,
        filterBy: 'all',
        center: {
          latitude: 39.952335,
          longitude: -75.163789
        }
      });

      map.$el = $(map.sel); // the jQuery element
      map.el = map.$el[0]; // the plain DOM element
      map.filterBy = map.options.filterBy;

      self.mapsById[map._id] = map;
      map.itemsById = {};
      _.each(map.items, function(item) {
        map.itemsById[item._id] = item;
      });

      map.googleMap = new google.maps.Map(map.el, {
        zoom: map.options.zoom || 12,
        minZoom: map.options.minZoom || 0,
        maxZoom: map.options.maxZoom || 100,
        panControl: map.options.panControl || true,
        zoomControl: map.options.zoomControl || true,
        scaleControl: map.options.scaleControl || true,
        draggable: map.options.draggable || true,
        streetViewControl: map.options.streetViewControl || true,
        center: new google.maps.LatLng(map.options.center.latitude, map.options.center.longitude),
        mapTypeId: map.options.mapTypeId || google.maps.MapTypeId.ROADMAP,
        styles: map.options.styles || {},
        scrollwheel: map.options.scrollwheel || false,
        mapTypeControl: map.options.mapTypeControl || false
      });

      self.autoZoom(map);
      self.autoCenter(map);

      // Create a jQuery event that can be used to filter by
      // a particular tag or 'all'
      map.$el.on('filter', function(e) {

        // grab any arguments after the first (the event object),
        // which represent one or more tags to filter by.
        // we need to do this because calling .trigger('filter', Array)
        // passes the array items as arguments, instead of as an array.
        var filterBy = Array.prototype.slice.call(arguments, 1);
        // if the only argument supplied is the string "all",
        // pass it through as a string.
        if(filterBy.length == 1 && filterBy[0] == 'all') {
          filterBy = 'all';
        }

        return self.filter(filterBy, map);
      });

      return callback(null);
    };

    self.renderItems = function(map, callback) {
      // loop through the items getting passed in from our browserCall
      // and create a marker / info box for each.
      _.each(map.items, function(item) {
        return self.renderItem(item, map);
      });
      return setImmediate(callback);
    };

    /*
    // THE DIRTY WORK
    */
    self.loadGoogleMaps = function(callback) {
      // Load dynamically but only if it wasn't already loaded in base.html
      if (window.google) {
        return callback();
      } else {
        // Must be global to work as a google loader callback
        window.aposGoogleMapApiReady = function() {
          return callback();
        };
        // apos.log('maps: dynamically loading google maps API');
        // Google will call aposGoogleMapApiReady for us
        self.addScript('https://maps.googleapis.com/maps/api/js?v=3.exp&libraries=places,geometry&sensor=false&callback=aposGoogleMapApiReady&key=' + self.options.key);
      }
    };

    // Dynamic loader for two scripts on Google Code
    // that don't normally support that. So we wait
    // until we see that they have defined something.

    self.loadGoogleCodeLibraries = function(callback) {
      // console.log('maps: google maps API ready, loading more libraries');

      var load = self.options.googleCodeLibraries || [
        {
          src: '/modules/apostrophe-places/js/vendor/infobox.js',
          defines: 'InfoBox'
        },
        {
          src: '/modules/apostrophe-places/js/vendor/richmarker-compiled.js',
          defines: 'RichMarker'
        }
      ];

      window.aposGoogleMapScriptsAdded = false;

      function wait() {
        var defined = 0;
        _.each(load, function(item) {
          if (window[item.defines]) {
            defined++;
          }
        });
        if (defined === load.length) {
          // apos.log('Maps: all libraries ready');
          return callback();
        }
        if (!window.aposGoogleMapScriptsAdded) {
          // apos.log('Maps: adding script tags');
          _.each(load, function(item) {
            self.addScript(item.src);
          });
          window.aposGoogleMapScriptsAdded = true;
        }
        setTimeout(wait, 50);
      };

      wait();
    };

    self.addScript = function(src) {
      var script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = src;
      document.body.appendChild(script);
    };

    // Geocode an item if needed
    self.geocodeOne = function(item, callback) {
      if ((!item.geo) && (item.address)) {
        self.geocoder.geocode( { 'address': item.address }, function(results, status) {
          if (status == google.maps.GeocoderStatus.OK) {
            item.geo = {
              type: 'Point',
              coordinates: [ results[0].geometry.location.lng(), results[0].geometry.location.lat() ]
            };
            return callback();
          } else {
            return callback();
          }
        });
      } else {
        return callback();
      }
    };

    self.renderItem = function(item, map) {
      if (!item.geo) {
        return;
      }

      self.generateMarker(item, map);
    };

    self.generateMarker = function(item, map) {
      var markerHTML = self.generateMarkerHTML(item, map);

      var coords;
      // If the address is already a coordinate pair ignore any geocoding result and use it directly
      if (item.address && item.address.match(/^[\-\+0-9\.\,\ ]+$/)) {
        var rawCoords = item.address.split(/,\s*/);
        coords = new google.maps.LatLng(parseFloat(rawCoords[0]), parseFloat(rawCoords[1]));
      } else {
        coords = new google.maps.LatLng(item.geo.coordinates[1], item.geo.coordinates[0]);
      }

      // SHOULD BE CONFIGURABLE.
      var marker = new RichMarker({
        position: coords,
        draggable: false,
        visible: true,
        clickable: true,
        shadow: 'none',
        map: map.googleMap,
        content: markerHTML
      });

      marker.locTypes = item.tags;
      item.marker = marker;
    };

    // Overridable hook to provide project level map marker.

    self.generateMarkerHTML = function(item, map) {
      var markerHTML = document.createElement('DIV');
          markerHTML.innerHTML = '<div data-location-id="' + item._id + '" data-map-id="' + map._id + '" class="apos-map-marker '+ apos.utils.cssName(item.category || '') +'"></div>';
      return markerHTML;
    };

    // IMPORTANT: if you want more properties to be visible here, make sure
    // you override the aposMapPruneLocations function to include them.
    // You can do that in your server-side extension of the map module.
    // See map/index.js for the original. Pruning is necessary to avoid
    // sending a zillion megabytes per page to the browser

    self.generateInfoBox = function(item, map, callback) {
      if(item.infoBox) {
        return callback(null);
      }

      // Clone the piece and remove the marker object, which will not
      // play nicely with the the ajax request. But don't clone deep,
      // we are only interested in getting rid of one top level property
      
      var locationPiece = _.clone(item);
      delete locationPiece.marker;

      $.post(map.action + '/infoBox', locationPiece).done(function(markup) {
        var boxOptions = {
          content: markup,
          disableAutoPan: false,
          pixelOffset: new google.maps.Size(10,-137),
          boxStyle: {
            width: "280px"
          },
          closeBoxMargin: "0px 0px 0px 0px",
          closeBoxURL: "//www.google.com/intl/en_us/mapfiles/close.gif",
          infoBoxClearance: new google.maps.Size(1, 1),
          pane: "floatPane",
          enableEventPropagation: false
        };

        item.infoBox = new InfoBox(boxOptions);
        return callback(null);
      });
    };

    self.activateInfoBox = function(item, map) {
      self.allItemsInactive(map);

      return self.generateInfoBox(item, map, function() {
        item.infoBox.open(map.googleMap, item.marker);
        item.marker.content.firstChild.className += " active";
      });
    };
    
    self.enableInfoBoxClicks = function() {
      $('body').on('click', '[data-location-id]', function() {
        var locationId = $(this).attr('data-location-id');
        var mapId = $(this).attr('data-map-id');
        var map = self.mapsById[mapId];
        if (!map) {
          // Maybe another subclass handles it
          return;
        }
        var item = map.itemsById[locationId];
        if (!item) {
          // Maybe another subclass handles it
          return;
        }
        self.activateInfoBox(item, map);
        return false;
      });
    };    

    self.allItemsInactive = function(map) {
      _.each(map.items, function(item) {
        if (item.infoBox) {
          item.infoBox.close();
        }

        if (item.marker) {
          item.marker.content.firstChild.className = item.marker.content.firstChild.className.replace(' active', '');
        }
      });
    };

    self.filter = function(filterBy, map) {
      map.filterBy = filterBy;

      _.each(map.items, function(item) {
        self.ifMappable(item, function(item) {
          if (item.infoBox) {
            item.infoBox.close();
          }

          if (item.marker) {
            item.marker.setVisible(false);
          }
        });
      });

      _.each(map.items, function(item) {
        self.ifFiltered(item, map, function(item) {
          if (item.marker) {
            item.marker.setVisible(true);
          }
        });
      });

      self.focusAfterFilter(map);
    };

    self.focusAfterFilter = function(map) {
      self.autoZoom(map);
      self.autoCenter(map);
    };

    self.ifMappable = function(item, callback) {
      if(item.geo) {
        return callback(item);
      }
    };

    self.ifFiltered = function(item, map, callback) {
      self.ifMappable(item, function(item) {
        if (map.filterBy === 'all') {
          return callback(item);
        } else {
          var filterBy = (_.isArray(map.filterBy)) ? map.filterBy : [map.filterBy];
          var marker = item.marker;

          if( _.intersection(map.filterBy, item.tags || []).length) {
            return callback(item);
          }
        }
      });
    };

    self.autoCenter = function(map) {
      var valid = 0;
      var lat = 0.0;
      var lng = 0.0;

      _.each(map.items, function(item) {
        self.ifFiltered(item, map, function(item) {
          lat += item.geo.coordinates[1];
          lng += item.geo.coordinates[0];
          valid++;
        });
      });

      if (valid) {
        map.mapCenter = new google.maps.LatLng(lat / valid, lng / valid);
      } else {
        map.mapCenter = new google.maps.LatLng(39.952335, -75.163789);
      }

      map.googleMap.setCenter(map.mapCenter);
    };

    self.autoZoom = function(map) {
      var bounds;
      // Auto-zoom
      bounds = new google.maps.LatLngBounds();
      var count = 0;

      _.each(map.items, function(item) {
        self.ifFiltered(item, map, function(item) {
          count++;
          bounds.extend(new google.maps.LatLng(item.geo.coordinates[1], item.geo.coordinates[0]));
        });
      });

      if (count > 1) {
         self.fitBounds(map, bounds);
         map.googleMap.fitBounds(bounds);
      } else if (count === 1) {
        map.googleMap.setZoom(15);
      }
    };

     // Make this overridable in case we want a
     // different zoom level to be default.
     self.fitBounds = function(map, bounds) {
       map.googleMap.fitBounds(bounds);
     };


    // Revert to whatever we had initially (for filtering by "all")
    self.resetZoom = function(map) {
      if(map.mapZoom) {
        map.googleMap.setZoom(map.mapZoom);
      } else {
        self.autoZoom(map);
      }
    };

    self.resetCenter = function(map) {
      if(map.mapCenter) {
        map.googleMap.setCenter(map.mapCenter);
      } else {
        self.autoCenter(map);
      }
    };

    apos.maps = apos.maps || {};
    apos.maps[options.name] = self;
  }
});
