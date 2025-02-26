// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoibWp0YW5nIiwiYSI6ImNtN2xlZXoyMDBheGoyam9lMG85eW9vMmoifQ.RhshB-L7SN1GP97tbma7tg';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/mapbox/streets-v12', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 5, // Minimum allowed zoom
    maxZoom: 18 // Maximum allowed zoom
});

const svg = d3.select('#map').select('svg');
let stations = [];
let trips = [];

// Declare new globals for filtered data
let filteredTrips = [];
let filteredArrivals = new Map();
let filteredDepartures = new Map();
let filteredStations = [];

let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

// Function to project station coordinates into pixel coordinates
function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point);  // Project to pixel coordinates
    return { cx: x, cy: y };  // Return as object for use in SVG attributes
}

map.on('load', () => { 
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
      }); 
    map.addLayer({
        id: 'boston-bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': '#ff7a7a',  // A light red using hex code
            'line-width': 3,          // Thicker lines
            'line-opacity': 0.6       // Slightly less transparent
        }
    });

    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson?...'
      }); 
    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': '#ff7a7a',  // A light red using hex code
            'line-width': 3,          // Thicker lines
            'line-opacity': 0.6       // Slightly less transparent
        }
    });

    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'
    d3.json(jsonurl).then(jsonData => {
        console.log('Loaded JSON Data:', jsonData);  // Log to verify structure
        stations = jsonData.data.stations;  // Populate the stations array

        // Append circles to the SVG for each station
        const circles = svg.selectAll('circle')
            .data(stations)
            .enter()
            .append('circle')
            .attr('r', 5)               // Radius of the circle
            .attr('fill', 'steelblue')  // Circle fill color
            .attr('stroke', 'white')    // Circle border color
            .attr('stroke-width', 1)    // Circle border thickness
            .attr('opacity', 0.8);     // Circle opacity

        // Define updatePositions within the scope of circles
        function updatePositions() {
            circles
                .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
                .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
        }

        // Initial position update when map loads
        updatePositions();

        // Reposition markers on map interactions
        map.on('move', updatePositions);     // Update during map movement
        map.on('zoom', updatePositions);     // Update during zooming
        map.on('resize', updatePositions);   // Update on window resize
        map.on('moveend', updatePositions);  // Final adjustment after movement ends
        
    }).catch(error => {
        console.error('Error loading JSON:', error);  // Handle errors if JSON loading fails
    });

    const csvurl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv'
    d3.csv(csvurl).then(loadedTrips => {
        trips = loadedTrips;
        
        for (let trip of trips) {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);
        }
        
        arrivals = d3.rollup(
            trips,
            (v) => v.length,
            (d) => d.end_station_id,
        );
        
        departures = d3.rollup(
            trips,
            (v) => v.length,
            (d) => d.start_station_id,
        );
        
        // Update stations based on trips
        stations = stations.map((station) => {
            let id = station.short_name;
            station.arrivals = arrivals.get(id) ?? 0;
            station.departures = departures.get(id) ?? 0;
            station.totalTraffic = station.arrivals + station.departures;
            return station;
        });
        
        // Define and update the circles' radii as needed…
        const radiusScale = d3.scaleSqrt()
            .domain([0, d3.max(stations, d => d.totalTraffic)])
            .range([0, 25]);
        
        svg.selectAll('circle')
            .attr('r', d => radiusScale(d.totalTraffic))
            .each(function(d) {
              d3.select(this)
                .append('title')
                .text(`${d.totalTraffic} trips (${d.departures, d.arrivals} arrivals)`)
            })
            .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));

    }).catch(error => {
        console.error('Error loading CSV Data:', error);
    });
});

let timeFilter = -1;
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
    return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

function updateTimeDisplay() {
    timeFilter = Number(timeSlider.value);  // Get slider value
      
    if (timeFilter === -1) {
      selectedTime.textContent = '';  // Clear time display
      anyTimeLabel.style.display = 'block';  // Show "(any time)"
    } else {
      selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
      anyTimeLabel.style.display = 'none';  // Hide "(any time)"
    }
  
    // Trigger filtering logic which will be implemented in the next step
    filterTripsbyTime();

    if (timeFilter === -1) {
        document.getElementById("selected-time").style.opacity = "0";
        document.getElementById("any-time").style.opacity = "1";
    } else {
        document.getElementById("selected-time").style.opacity = "1";
        document.getElementById("any-time").style.opacity = "0";
    }
}

timeSlider.addEventListener('input', updateTimeDisplay);

updateTimeDisplay();

// Utility: Convert a Date to minutes since midnight
function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function filterTripsbyTime() {
    // Filter trips: If the timeFilter is -1, include all trips.
    filteredTrips = timeFilter === -1
      ? trips
      : trips.filter((trip) => {
          const startedMinutes = minutesSinceMidnight(trip.started_at);
          const endedMinutes = minutesSinceMidnight(trip.ended_at);
          return (
            Math.abs(startedMinutes - timeFilter) <= 60 ||
            Math.abs(endedMinutes - timeFilter) <= 60
          );
        });
  
    // Compute filtered arrivals and departures from filteredTrips
    filteredArrivals = d3.rollup(
        filteredTrips,
        v => v.length,
        d => d.end_station_id
    );
  
    filteredDepartures = d3.rollup(
        filteredTrips,
        v => v.length,
        d => d.start_station_id
    );
  
    // Create filteredStations without modifying the original stations:
    filteredStations = stations.map(originalStation => {
        // Clone the station to avoid modifying the original
        const station = { ...originalStation };
        const id = station.short_name;
        station.arrivals = filteredArrivals.get(id) ?? 0;
        station.departures = filteredDepartures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures;
        return station;
    });

    // After building filteredStations in filterTripsbyTime():
    const currentStations = timeFilter === -1 ? stations : filteredStations;
    const radiusRange = timeFilter === -1 ? [0, 25] : [0, 20];

    const updatedRadiusScale = d3.scaleSqrt()
    .domain([0, d3.max(currentStations, d => d.totalTraffic)])
    .range(radiusRange);

    // Update each circle's radius using the new scale
    svg.selectAll('circle')
    .data(currentStations, d => d.short_name)  // use a unique key
    .attr('r', d => updatedRadiusScale(d.totalTraffic))
    .each(function(d) {
        d3.select(this).select('title').remove();
        d3.select(this)
        .append('title')
        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    })
    .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));
}