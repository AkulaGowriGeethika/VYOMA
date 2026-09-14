/* =========================================================
   VYOMA SMART NAVIGATION
   FULL NAVIGATION + PROTOTYPE + GNSS LOSS
========================================================= */


/* =========================================================
   BACKEND
========================================================= */

// Replace this with your CURRENT backend Cloudflare URL.
const BACKEND_URL =
  "https://accomplish-kilometers-lauderdale-month.trycloudflare.com";


/* =========================================================
   GLOBAL STATE
========================================================= */

let map = null;

let routeCoordinates = [];
let routeSteps = [];

let routeLine = null;

let vehicleMarker = null;
let destinationMarker = null;
let startMarker = null;

let routeIndex = 0;

let navigationRunning = false;
let navigationStarted = false;

let prototypeMode = false;
let selectedMode = "real";

let gnssLost = false;

let prototypeTimer = null;
let deadReckoningTimer = null;

let gpsWatchId = null;

let currentPosition = null;
let lastRealPosition = null;
let lastDeadReckoningPosition = null;

let currentSpeed = 0;
let currentHeading = 0;

let prototypeSpeedKmh = 30;
let prototypeDistanceMeters = 0;

let driftMeters = 0;
let mlEstimate = 0;
let filterCorrection = 0;

let imuBuffer = [];

let realSensorsStarted = false;
let orientationSensorsStarted = false;

let mlRequestRunning = false;

let lastIMUTimestamp = 0;

let followVehicleEnabled = true;
let automaticZoomEnabled = true;

let activePanel = "navigate";


/* =========================================================
   DOM
========================================================= */

const speedValue =
  document.getElementById("speedValue");

const headingValue =
  document.getElementById("headingValue");

const navStatus =
  document.getElementById("navStatus");

const modeTitle =
  document.getElementById("modeTitle");

const modeSubtitle =
  document.getElementById("modeSubtitle");

const modeIndicator =
  document.getElementById("modeIndicator");

const guidanceInstruction =
  document.getElementById("guidanceInstruction");

const guidanceDistance =
  document.getElementById("guidanceDistance");

const guidanceRoad =
  document.getElementById("guidanceRoad");

const headerStatus =
  document.getElementById("headerStatus");

const systemStatus =
  document.getElementById("systemStatus");

const routeStatus =
  document.getElementById("routeStatus");

const routeInfo =
  document.getElementById("routeInfo");

const distanceValue =
  document.getElementById("distanceValue");

const durationValue =
  document.getElementById("durationValue");

const remainingValue =
  document.getElementById("remainingValue");

const aiStatus =
  document.getElementById("aiStatus");

const driftValue =
  document.getElementById("driftValue");

const mlValue =
  document.getElementById("mlValue");

const correctionValue =
  document.getElementById("correctionValue");

const sampleValue =
  document.getElementById("sampleValue");

const processingFill =
  document.getElementById("processingFill");

const realImuStatus =
  document.getElementById("realImuStatus");

const axValue =
  document.getElementById("axValue");

const ayValue =
  document.getElementById("ayValue");

const azValue =
  document.getElementById("azValue");

const gxValue =
  document.getElementById("gxValue");

const gyValue =
  document.getElementById("gyValue");

const gzValue =
  document.getElementById("gzValue");

const fromInput =
  document.getElementById("fromInput");

const toInput =
  document.getElementById("toInput");

const bottomSheet =
  document.getElementById("bottomSheet");


/* =========================================================
   INITIALIZE MAP
========================================================= */

function initializeMap() {

  map = L.map("map", {
    zoomControl: false,
    attributionControl: true
  }).setView(
    [16.5062, 80.6480],
    13
  );


  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 20,
      attribution:
        "© OpenStreetMap contributors"
    }
  ).addTo(map);

}


/* =========================================================
   SVG VEHICLE
========================================================= */

function vehicleIcon(isLoss = false) {

  const color =
    isLoss
      ? "#ef4444"
      : "#2563eb";


  return L.divIcon({

    className: "vyoma-vehicle",

    iconSize: [42, 42],

    iconAnchor: [21, 21],

    html: `
      <div
        class="vehicle-marker ${isLoss ? "loss" : ""}"
        style="background:${color}"
      >

        <svg
          width="25"
          height="25"
          viewBox="0 0 24 24"
          fill="white"
        >
          <path d="
            M12 2
            L18 20
            L12 17
            L6 20
            Z
          "></path>
        </svg>

      </div>
    `
  });
}


function setVehicleIcon(isLoss) {

  if (!vehicleMarker) return;

  vehicleMarker.setIcon(
    vehicleIcon(isLoss)
  );
}


/* =========================================================
   DESTINATION ICON
========================================================= */

function destinationIcon() {

  return L.divIcon({

    className: "vyoma-vehicle",

    iconSize: [36, 36],

    iconAnchor: [18, 34],

    html: `
      <div style="
        width:30px;
        height:30px;
        border-radius:50% 50% 50% 0;
        background:#111827;
        border:3px solid white;
        transform:rotate(-45deg);
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow:0 3px 12px rgba(0,0,0,.25);
      ">
        <div style="
          width:8px;
          height:8px;
          border-radius:50%;
          background:white;
        "></div>
      </div>
    `
  });
}


/* =========================================================
   CURRENT LOCATION
========================================================= */

function getCurrentLocation() {

  return new Promise((resolve, reject) => {

    if (!navigator.geolocation) {

      reject(
        new Error(
          "Geolocation is not supported."
        )
      );

      return;
    }


    navigator.geolocation.getCurrentPosition(

      position => {

        const lat =
          position.coords.latitude;

        const lon =
          position.coords.longitude;


        currentPosition =
          [lat, lon];

        window.currentGPSStart =
          [lat, lon];


        fromInput.value =
          "Current Location";


        if (!vehicleMarker) {

          vehicleMarker =
            L.marker(
              [lat, lon],
              {
                icon: vehicleIcon(false)
              }
            ).addTo(map);

        } else {

          vehicleMarker.setLatLng(
            [lat, lon]
          );

        }


        map.setView(
          [lat, lon],
          17
        );


        resolve(
          [lat, lon]
        );

      },

      error => {

        reject(error);

      },

      {
        enableHighAccuracy: true,

        maximumAge: 0,

        timeout: 12000
      }
    );

  });
}


/* =========================================================
   GEOCODING
========================================================= */

async function geocodeAddress(address) {

  const url =
    "https://nominatim.openstreetmap.org/search" +
    "?format=json" +
    "&limit=1" +
    "&q=" +
    encodeURIComponent(address);


  const response =
    await fetch(url);


  if (!response.ok) {

    throw new Error(
      "Geocoding failed."
    );

  }


  const data =
    await response.json();


  if (!data.length) {

    throw new Error(
      `Location not found: ${address}`
    );

  }


  return [
    Number(data[0].lat),
    Number(data[0].lon)
  ];
}


/* =========================================================
   ROUTE
========================================================= */

async function createRoute() {

  const destination =
    toInput.value.trim();


  if (!destination) {

    alert(
      "Enter a destination first."
    );

    return;
  }


  try {

    systemStatus.textContent =
      "Calculating route...";

    routeStatus.textContent =
      "Calculating route...";


    let start;


    if (
      !fromInput.value.trim() ||
      fromInput.value.trim()
        .toLowerCase()
        === "current location"
    ) {

      start =
        await getCurrentLocation();

    } else {

      start =
        await geocodeAddress(
          fromInput.value.trim()
        );

    }


    const end =
      await geocodeAddress(
        destination
      );


    const url =
      "https://router.project-osrm.org/route/v1/driving/" +
      `${start[1]},${start[0]};${end[1]},${end[0]}` +
      "?overview=full" +
      "&geometries=geojson" +
      "&steps=true";


    const response =
      await fetch(url);


    if (!response.ok) {

      throw new Error(
        "Routing service failed."
      );

    }


    const data =
      await response.json();


    if (
      !data.routes ||
      !data.routes.length
    ) {

      throw new Error(
        "No route found."
      );

    }


    const route =
      data.routes[0];


    routeCoordinates =
      route.geometry.coordinates.map(
        point => [
          point[1],
          point[0]
        ]
      );


    routeSteps =
      route.legs?.[0]?.steps || [];


    routeIndex = 0;

    prototypeDistanceMeters = 0;


    /* Remove old route */

    if (routeLine) {

      map.removeLayer(
        routeLine
      );

    }


    if (startMarker) {

      map.removeLayer(
        startMarker
      );

    }


    if (destinationMarker) {

      map.removeLayer(
        destinationMarker
      );

    }


    /* Draw route */

    routeLine =
      L.polyline(
        routeCoordinates,
        {
          color: "#2563eb",
          weight: 6,
          opacity: .9
        }
      ).addTo(map);


    startMarker =
      L.circleMarker(
        start,
        {
          radius: 6,
          color: "#2563eb",
          fillColor: "#ffffff",
          fillOpacity: 1,
          weight: 3
        }
      ).addTo(map);


    destinationMarker =
      L.marker(
        end,
        {
          icon:
            destinationIcon()
        }
      ).addTo(map);


    /* Vehicle */

    if (!vehicleMarker) {

      vehicleMarker =
        L.marker(
          start,
          {
            icon:
              vehicleIcon(false)
          }
        ).addTo(map);

    } else {

      vehicleMarker.setLatLng(
        start
      );

    }


    currentPosition =
      [...start];


    lastRealPosition =
      [...start];


    /* Route metrics */

    const distanceKm =
      route.distance / 1000;

    const durationMin =
      route.duration / 60;


    distanceValue.textContent =
      `${distanceKm.toFixed(1)} km`;

    durationValue.textContent =
      `${Math.round(durationMin)} min`;

    remainingValue.textContent =
      `${distanceKm.toFixed(1)} km`;


    routeStatus.textContent =
      "Route ready";


    routeInfo.textContent =
      `Route calculated. ${distanceKm.toFixed(1)} km, approximately ${Math.round(durationMin)} minutes.`;


    guidanceInstruction.textContent =
      "Ready to navigate";


    guidanceDistance.textContent =
      `${distanceKm.toFixed(1)} km remaining`;


    guidanceRoad.textContent =
      "";


    systemStatus.textContent =
      "Route calculated";


    /* Auto fit */

    map.fitBounds(
      routeLine.getBounds(),
      {
        paddingTopLeft: [20, 170],
        paddingBottomRight: [20, 150]
      }
    );


  } catch (error) {

    console.error(error);

    systemStatus.textContent =
      "Route calculation failed";

    routeStatus.textContent =
      error.message;

    alert(
      error.message
    );

  }

}


/* =========================================================
   DISTANCE
========================================================= */

function haversineDistance(
  lat1,
  lon1,
  lat2,
  lon2
) {

  const R =
    6371000;


  const dLat =
    (lat2 - lat1) *
    Math.PI / 180;


  const dLon =
    (lon2 - lon1) *
    Math.PI / 180;


  const a =
    Math.sin(dLat / 2) ** 2 +

    Math.cos(
      lat1 * Math.PI / 180
    ) *

    Math.cos(
      lat2 * Math.PI / 180
    ) *

    Math.sin(dLon / 2) ** 2;


  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}


function calculateTotalRouteDistance() {

  let total = 0;


  for (
    let i = 1;
    i < routeCoordinates.length;
    i++
  ) {

    total +=
      haversineDistance(
        routeCoordinates[i - 1][0],
        routeCoordinates[i - 1][1],
        routeCoordinates[i][0],
        routeCoordinates[i][1]
      );

  }


  return total;
}


/* =========================================================
   BEARING
========================================================= */

function calculateBearing(
  lat1,
  lon1,
  lat2,
  lon2
) {

  const y =
    Math.sin(
      (lon2 - lon1) *
      Math.PI / 180
    ) *
    Math.cos(
      lat2 *
      Math.PI / 180
    );


  const x =
    Math.cos(
      lat1 *
      Math.PI / 180
    ) *
    Math.sin(
      lat2 *
      Math.PI / 180
    ) -

    Math.sin(
      lat1 *
      Math.PI / 180
    ) *
    Math.cos(
      lat2 *
      Math.PI / 180
    ) *
    Math.cos(
      (lon2 - lon1) *
      Math.PI / 180
    );


  return (
    Math.atan2(y, x) *
    180 /
    Math.PI +
    360
  ) % 360;
}


/* =========================================================
   FORMAT DISTANCE
========================================================= */

function formatDistance(
  meters
) {

  if (
    meters < 1000
  ) {

    return `${Math.round(meters)} m`;

  }


  return `${(
    meters / 1000
  ).toFixed(1)} km`;
}


/* =========================================================
   GUIDANCE
========================================================= */

function maneuverInstruction(
  step
) {

  if (!step) {

    return "Continue ahead";

  }


  const type =
    step.maneuver?.type || "";

  const modifier =
    step.maneuver?.modifier || "";


  const road =
    step.name ||
    "";


  let instruction =
    "Continue";


  if (
    type === "arrive"
  ) {

    instruction =
      "Arrive at destination";

  } else if (
    type === "depart"
  ) {

    instruction =
      "Start navigation";

  } else if (
    type === "turn"
  ) {

    if (
      modifier.includes("left")
    ) {

      instruction =
        "Turn left";

    } else if (
      modifier.includes("right")
    ) {

      instruction =
        "Turn right";

    } else {

      instruction =
        "Turn";

    }

  } else if (
    type === "roundabout" ||
    type === "rotary"
  ) {

    instruction =
      "Enter roundabout";

  } else if (
    type === "merge"
  ) {

    instruction =
      "Merge";

  } else if (
    type === "fork"
  ) {

    instruction =
      modifier.includes("left")
        ? "Keep left"
        : "Keep right";

  } else if (
    type === "new name"
  ) {

    instruction =
      "Continue";

  }


  if (
    road &&
    type !== "arrive"
  ) {

    return `${instruction} onto ${road}`;

  }


  return instruction;
}


/* =========================================================
   GUIDANCE ICON
========================================================= */

function setGuidanceIcon(
  type,
  modifier
) {

  let svg = "";


  if (
    type === "turn" &&
    modifier.includes("left")
  ) {

    svg = `
      <svg class="ui-icon" viewBox="0 0 24 24">
        <path d="M19 6H9a5 5 0 00-5 5v7"></path>
        <path d="M8 15l-4 4-4-4"></path>
      </svg>
    `;

  } else if (
    type === "turn" &&
    modifier.includes("right")
  ) {

    svg = `
      <svg class="ui-icon" viewBox="0 0 24 24">
        <path d="M5 6h10a5 5 0 015 5v7"></path>
        <path d="M16 15l4 4 4-4"></path>
      </svg>
    `;

  } else if (
    type === "arrive"
  ) {

    svg = `
      <svg class="ui-icon" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8"></circle>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;

  } else {

    svg = `
      <svg class="ui-icon" viewBox="0 0 24 24">
        <path d="M12 19V5"></path>
        <path d="M6 11l6-6 6 6"></path>
      </svg>
    `;

  }


  document.getElementById(
    "guidanceIcon"
  ).innerHTML = svg;
}


/* =========================================================
   UPDATE GUIDANCE
========================================================= */

function updateGuidance(
  lat,
  lon,
  indexHint = null
) {

  if (
    !routeCoordinates.length
  ) {

    return;

  }


  let nearestIndex =
    indexHint ?? 0;


  if (
    indexHint === null
  ) {

    let nearestDistance =
      Infinity;


    for (
      let i = 0;
      i < routeCoordinates.length;
      i++
    ) {

      const d =
        haversineDistance(
          lat,
          lon,
          routeCoordinates[i][0],
          routeCoordinates[i][1]
        );


      if (
        d < nearestDistance
      ) {

        nearestDistance = d;

        nearestIndex = i;

      }

    }

  }


  routeIndex =
    nearestIndex;


  /* Remaining route */

  let remaining =
    0;


  for (
    let i = nearestIndex + 1;
    i < routeCoordinates.length;
    i++
  ) {

    remaining +=
      haversineDistance(
        routeCoordinates[i - 1][0],
        routeCoordinates[i - 1][1],
        routeCoordinates[i][0],
        routeCoordinates[i][1]
      );

  }


  remainingValue.textContent =
    formatDistance(
      remaining
    );


  /* OSRM steps */

  if (
    routeSteps.length
  ) {

    let selectedStep =
      null;


    let selectedDistance =
      Infinity;


    for (
      const step of routeSteps
    ) {

      const maneuverLocation =
        step.maneuver?.location;


      if (
        !maneuverLocation
      ) continue;


      const stepLat =
        maneuverLocation[1];

      const stepLon =
        maneuverLocation[0];


      const distance =
        haversineDistance(
          lat,
          lon,
          stepLat,
          stepLon
        );


      if (
        distance < selectedDistance &&
        distance > 8
      ) {

        selectedDistance =
          distance;

        selectedStep =
          step;

      }

    }


    if (
      selectedStep
    ) {

      guidanceInstruction.textContent =
        maneuverInstruction(
          selectedStep
        );


      guidanceDistance.textContent =
        formatDistance(
          selectedDistance
        );


      guidanceRoad.textContent =
        selectedStep.name
          ? selectedStep.name
          : "";


      setGuidanceIcon(
        selectedStep.maneuver?.type,
        selectedStep.maneuver?.modifier || ""
      );


      return;

    }

  }


  if (
    nearestIndex >=
    routeCoordinates.length - 3
  ) {

    guidanceInstruction.textContent =
      "You have arrived";


    guidanceDistance.textContent =
      "Destination reached";


    guidanceRoad.textContent =
      "";


    setGuidanceIcon(
      "arrive",
      ""
    );


    return;

  }


  const next =
    routeCoordinates[
      Math.min(
        nearestIndex + 1,
        routeCoordinates.length - 1
      )
    ];


  const bearing =
    calculateBearing(
      lat,
      lon,
      next[0],
      next[1]
    );


  currentHeading =
    bearing;


  guidanceInstruction.textContent =
    "Continue ahead";


  guidanceDistance.textContent =
    formatDistance(
      haversineDistance(
        lat,
        lon,
        next[0],
        next[1]
      )
    );


  guidanceRoad.textContent =
    "";


  setGuidanceIcon(
    "continue",
    ""
  );

}


/* =========================================================
   UPDATE AI METRICS
========================================================= */

function updateAIMetrics() {

  driftValue.textContent =
    `${driftMeters.toFixed(2)} m`;


  mlValue.textContent =
    `${mlEstimate.toFixed(2)} m`;


  correctionValue.textContent =
    `${filterCorrection.toFixed(2)} m`;


  sampleValue.textContent =
    imuBuffer.length;


  const progress =
    Math.min(
      100,
      (imuBuffer.length / 50) * 100
    );


  processingFill.style.width =
    `${progress}%`;

}


/* =========================================================
   IMU DISPLAY
========================================================= */

function updateIMUDisplay(
  sample
) {

  axValue.textContent =
    Number(sample.ax).toFixed(2);

  ayValue.textContent =
    Number(sample.ay).toFixed(2);

  azValue.textContent =
    Number(sample.az).toFixed(2);

  gxValue.textContent =
    Number(sample.gx).toFixed(2);

  gyValue.textContent =
    Number(sample.gy).toFixed(2);

  gzValue.textContent =
    Number(sample.gz).toFixed(2);

}


/* =========================================================
   SIMULATED IMU
========================================================= */

function createPrototypeIMUSample() {

  const t =
    Date.now() / 1000;


  return {

    ax:
      0.15 +
      Math.sin(t * 1.2) * 0.04,

    ay:
      0.08 +
      Math.cos(t * 0.9) * 0.03,

    az:
      9.81 +
      Math.sin(t * 0.7) * 0.05,

    gx:
      Math.sin(t * 0.8) * 0.15,

    gy:
      Math.cos(t * 0.6) * 0.12,

    gz:
      Math.sin(t * 0.5) * 0.20
  };
}


/* =========================================================
   PROTOTYPE ROUTE POSITION
   REALISTIC SPEED
========================================================= */

function getPointAlongRoute(
  distanceMeters
) {

  if (
    !routeCoordinates.length
  ) {

    return null;

  }


  let travelled =
    0;


  for (
    let i = 1;
    i < routeCoordinates.length;
    i++
  ) {

    const prev =
      routeCoordinates[i - 1];

    const next =
      routeCoordinates[i];


    const segmentDistance =
      haversineDistance(
        prev[0],
        prev[1],
        next[0],
        next[1]
      );


    if (
      travelled +
      segmentDistance >=
      distanceMeters
    ) {

      const remaining =
        distanceMeters -
        travelled;


      const ratio =
        segmentDistance > 0
          ? remaining /
            segmentDistance
          : 0;


      return [

        prev[0] +
        (next[0] - prev[0]) *
        ratio,

        prev[1] +
        (next[1] - prev[1]) *
        ratio

      ];

    }


    travelled +=
      segmentDistance;

  }


  return routeCoordinates[
    routeCoordinates.length - 1
  ];
}


/* =========================================================
   FIND ROUTE INDEX
========================================================= */

function findNearestRouteIndex(
  point,
  startIndex = 0
) {

  let nearestIndex =
    startIndex;

  let nearestDistance =
    Infinity;


  const begin =
    Math.max(
      0,
      startIndex - 5
    );


  const end =
    Math.min(
      routeCoordinates.length,
      startIndex + 40
    );


  for (
    let i = begin;
    i < end;
    i++
  ) {

    const d =
      haversineDistance(
        point[0],
        point[1],
        routeCoordinates[i][0],
        routeCoordinates[i][1]
      );


    if (
      d < nearestDistance
    ) {

      nearestDistance = d;

      nearestIndex = i;

    }

  }


  return nearestIndex;
}


/* =========================================================
   START PROTOTYPE
========================================================= */

function startPrototypeMode() {

  if (
    !routeCoordinates.length
  ) {

    alert(
      "Calculate a route first."
    );

    return;

  }


  stopMovementOnly();


  selectedMode =
    "prototype";

  prototypeMode =
    true;

  navigationRunning =
    true;

  navigationStarted =
    true;

  gnssLost =
    false;


  document.body.classList.remove(
    "gnss-loss"
  );


  routeIndex = 0;

  prototypeDistanceMeters = 0;

  driftMeters = 0;

  mlEstimate = 0;

  filterCorrection = 0;

  imuBuffer = [];


  const firstPoint =
    routeCoordinates[0];


  currentPosition =
    [...firstPoint];


  if (!vehicleMarker) {

    vehicleMarker =
      L.marker(
        firstPoint,
        {
          icon:
            vehicleIcon(false)
        }
      ).addTo(map);

  } else {

    vehicleMarker.setLatLng(
      firstPoint
    );

    setVehicleIcon(false);

  }


  navigationInfoUpdate();


  modeTitle.textContent =
    "PROTOTYPE NAVIGATION";

  modeSubtitle.textContent =
    "Simulated GPS + IMU";

  modeIndicator.textContent =
    "SIMULATED";

  modeIndicator.className =
    "mode-indicator prototype";


  navStatus.textContent =
    "SIMULATED GNSS";


  headerStatus.textContent =
    "PROTOTYPE";


  systemStatus.textContent =
    "Prototype navigation running";


  aiStatus.textContent =
    "AI + FILTER READY";


  realImuStatus.textContent =
    "SIMULATED IMU";


  guidanceInstruction.textContent =
    "Starting route";


  guidanceDistance.textContent =
    formatDistance(
      calculateTotalRouteDistance()
    );


  startPrototypeMovement();

}


/* =========================================================
   PROTOTYPE MOVEMENT
========================================================= */

function startPrototypeMovement() {

  clearInterval(
    prototypeTimer
  );


  /*
    IMPORTANT:

    30 km/h =
    8.33 metres per second.

    The old version jumped route points.
    This version moves by actual distance.
  */

  prototypeSpeedKmh =
    30;


  const intervalMs =
    1000;


  prototypeTimer =
    setInterval(() => {

      if (
        !navigationRunning ||
        !prototypeMode
      ) {

        return;

      }


      if (
        !routeCoordinates.length
      ) {

        return;

      }


      const metersPerSecond =
        prototypeSpeedKmh / 3.6;


      prototypeDistanceMeters +=
        metersPerSecond *
        (intervalMs / 1000);


      const totalDistance =
        calculateTotalRouteDistance();


      if (
        prototypeDistanceMeters >=
        totalDistance
      ) {

        prototypeDistanceMeters =
          totalDistance;

      }


      const point =
        getPointAlongRoute(
          prototypeDistanceMeters
        );


      if (!point) return;


      routeIndex =
        findNearestRouteIndex(
          point,
          routeIndex
        );


      if (vehicleMarker) {

        vehicleMarker.setLatLng(
          point
        );

      }


      if (
        routeIndex <
        routeCoordinates.length - 1
      ) {

        const next =
          routeCoordinates[
            Math.min(
              routeIndex + 1,
              routeCoordinates.length - 1
            )
          ];


        currentHeading =
          calculateBearing(
            point[0],
            point[1],
            next[0],
            next[1]
          );

      }


      currentSpeed =
        prototypeSpeedKmh;


      speedValue.textContent =
        Math.round(
          currentSpeed
        );


      headingValue.textContent =
        `${Math.round(
          currentHeading
        )}°`;


      currentPosition =
        [...point];


      /* Follow vehicle */

      if (
        followVehicleEnabled
      ) {

        map.setView(
          point,
          automaticZoomEnabled
            ? 18
            : map.getZoom(),
          {
            animate: true,
            duration: .5
          }
        );

      }


      /* Guidance */

      updateGuidance(
        point[0],
        point[1],
        routeIndex
      );


      /* IMU */

      const sample =
        createPrototypeIMUSample();


      updateIMUDisplay(
        sample
      );


      imuBuffer.push([

        sample.ax,
        sample.ay,
        sample.az,

        sample.gx,
        sample.gy,
        sample.gz

      ]);


      if (
        imuBuffer.length > 50
      ) {

        imuBuffer.shift();

      }


      /* AI */

      if (gnssLost) {

        driftMeters =
          Math.min(
            12,
            driftMeters + 0.08
          );


        mlEstimate =
          Math.min(
            12,
            driftMeters * .85
          );


        filterCorrection =
          Math.min(
            driftMeters,
            mlEstimate * .45
          );


        aiStatus.textContent =
          "DEAD RECKONING ACTIVE";

      } else {

        driftMeters =
          Math.max(
            0,
            driftMeters - .04
          );


        mlEstimate =
          Math.max(
            0,
            driftMeters * .7
          );


        filterCorrection =
          Math.min(
            driftMeters,
            mlEstimate * .35
          );


        aiStatus.textContent =
          "AI + FILTER ACTIVE";

      }


      updateAIMetrics();


      /* Backend ML after 50 samples */

      if (
        imuBuffer.length === 50
      ) {

        sendSequenceToML();

      }


      /* Arrival */

      if (
        prototypeDistanceMeters >=
        totalDistance
      ) {

        clearInterval(
          prototypeTimer
        );


        navigationRunning =
          false;


        navStatus.textContent =
          "ARRIVED";


        guidanceInstruction.textContent =
          "You have arrived";


        guidanceDistance.textContent =
          "Destination reached";


        systemStatus.textContent =
          "Prototype route completed";

      }

    }, intervalMs);

}


/* =========================================================
   REAL NAVIGATION
========================================================= */

async function startRealNavigation() {

  if (
    !routeCoordinates.length
  ) {

    alert(
      "Calculate a route first."
    );

    return;

  }


  stopMovementOnly();


  selectedMode =
    "real";

  prototypeMode =
    false;

  navigationRunning =
    true;

  navigationStarted =
    true;

  gnssLost =
    false;


  document.body.classList.remove(
    "gnss-loss"
  );


  setVehicleIcon(false);


  modeTitle.textContent =
    "NORMAL NAVIGATION";

  modeSubtitle.textContent =
    "Real GPS + IMU";

  modeIndicator.textContent =
    "GNSS";

  modeIndicator.className =
    "mode-indicator";


  navStatus.textContent =
    "GNSS ACTIVE";


  headerStatus.textContent =
    "NAVIGATING";


  systemStatus.textContent =
    "Real navigation running";


  aiStatus.textContent =
    "AI + FILTER ACTIVE";


  /* Sensors */

  await startRealSensors();


  /* Immediate GPS */

  navigator.geolocation.getCurrentPosition(

    handleRealPosition,

    handleGpsError,

    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }

  );


  /* Continuous GPS */

  gpsWatchId =
    navigator.geolocation.watchPosition(

      handleRealPosition,

      handleGpsError,

      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }

    );

}


/* =========================================================
   REAL GPS POSITION
========================================================= */

function handleRealPosition(
  position
) {

  const lat =
    position.coords.latitude;

  const lon =
    position.coords.longitude;


  const newPosition =
    [lat, lon];


  /* When GNSS loss is simulated,
     ignore GPS for navigation. */

  if (
    gnssLost
  ) {

    return;

  }


  let speed =
    position.coords.speed;


  if (
    speed !== null &&
    speed >= 0
  ) {

    currentSpeed =
      speed * 3.6;

  } else if (
    lastRealPosition
  ) {

    const distance =
      haversineDistance(
        lastRealPosition[0],
        lastRealPosition[1],
        lat,
        lon
      );


    currentSpeed =
      Math.max(
        0,
        distance / .5 * 3.6
      );

  }


  let heading =
    position.coords.heading;


  if (
    heading !== null &&
    heading >= 0
  ) {

    currentHeading =
      heading;

  } else if (
    lastRealPosition
  ) {

    currentHeading =
      calculateBearing(
        lastRealPosition[0],
        lastRealPosition[1],
        lat,
        lon
      );

  }


  currentPosition =
    newPosition;


  lastRealPosition =
    newPosition;


  if (!vehicleMarker) {

    vehicleMarker =
      L.marker(
        newPosition,
        {
          icon:
            vehicleIcon(false)
        }
      ).addTo(map);

  } else {

    vehicleMarker.setLatLng(
      newPosition
    );

  }


  speedValue.textContent =
    Math.round(
      currentSpeed
    );


  headingValue.textContent =
    `${Math.round(
      currentHeading
    )}°`;


  navStatus.textContent =
    "GNSS ACTIVE";


  updateGuidance(
    lat,
    lon
  );


  if (
    followVehicleEnabled
  ) {

    map.setView(
      newPosition,
      automaticZoomEnabled
        ? 18
        : map.getZoom(),
      {
        animate: true,
        duration: .4
      }
    );

  }

}


/* =========================================================
   GPS ERROR
========================================================= */

function handleGpsError(
  error
) {

  console.warn(
    "GPS error:",
    error
  );


  if (
    !gnssLost
  ) {

    navStatus.textContent =
      "GPS SIGNAL WEAK";

    headerStatus.textContent =
      "GPS WEAK";

  }

}


/* =========================================================
   REAL SENSOR START
========================================================= */

async function startRealSensors() {

  if (
    realSensorsStarted
  ) {

    return;

  }


  if (
    !window.isSecureContext
  ) {

    realImuStatus.textContent =
      "HTTPS REQUIRED";

    aiStatus.textContent =
      "Real phone sensors require HTTPS.";


    return;

  }


  try {

    /* iOS permission */

    if (
      typeof DeviceMotionEvent !==
        "undefined" &&

      typeof DeviceMotionEvent
        .requestPermission ===
        "function"
    ) {

      const permission =
        await DeviceMotionEvent
          .requestPermission();


      if (
        permission !== "granted"
      ) {

        realImuStatus.textContent =
          "MOTION PERMISSION DENIED";

        return;

      }

    }


    if (
      typeof DeviceOrientationEvent !==
        "undefined" &&

      typeof DeviceOrientationEvent
        .requestPermission ===
        "function"
    ) {

      const permission =
        await DeviceOrientationEvent
          .requestPermission();


      if (
        permission !== "granted"
      ) {

        realImuStatus.textContent =
          "ORIENTATION DENIED";

      }

    }


    window.removeEventListener(
      "devicemotion",
      handleRealMotion,
      true
    );


    window.removeEventListener(
      "deviceorientation",
      handleRealOrientation,
      true
    );


    window.addEventListener(
      "devicemotion",
      handleRealMotion,
      {
        passive: true
      }
    );


    window.addEventListener(
      "deviceorientation",
      handleRealOrientation,
      {
        passive: true
      }
    );


    realSensorsStarted =
      true;

    orientationSensorsStarted =
      true;


    realImuStatus.textContent =
      "LIVE IMU";


  } catch (error) {

    console.error(error);

    realImuStatus.textContent =
      "SENSOR ERROR";

  }

}


/* =========================================================
   REAL MOTION
========================================================= */

function handleRealMotion(
  event
) {

  const acceleration =
    event.acceleration ||
    event.accelerationIncludingGravity;


  if (!acceleration) {

    return;

  }


  const ax =
    Number(acceleration.x || 0);

  const ay =
    Number(acceleration.y || 0);

  const az =
    Number(acceleration.z || 0);


  const rotation =
    event.rotationRate || {};


  const gx =
    Number(rotation.alpha || 0);

  const gy =
    Number(rotation.beta || 0);

  const gz =
    Number(rotation.gamma || 0);


  const sample = {

    ax,
    ay,
    az,

    gx,
    gy,
    gz

  };


  updateIMUDisplay(
    sample
  );


  imuBuffer.push([

    ax,
    ay,
    az,

    gx,
    gy,
    gz

  ]);


  if (
    imuBuffer.length > 50
  ) {

    imuBuffer.shift();

  }


  if (
    !gnssLost
  ) {

    updateAIMetrics();

    return;

  }


  /* Dead reckoning display */

  const horizontalAccel =
    Math.sqrt(
      ax * ax +
      ay * ay
    );


  driftMeters =
    Math.min(
      12,
      driftMeters +
      Math.min(
        .04,
        horizontalAccel *
        .002
      )
    );


  mlEstimate =
    Math.min(
      12,
      driftMeters * .8
    );


  filterCorrection =
    Math.min(
      driftMeters,
      mlEstimate * .4
    );


  updateAIMetrics();


  if (
    imuBuffer.length === 50
  ) {

    sendSequenceToML();

  }

}


/* =========================================================
   ORIENTATION
========================================================= */

function handleRealOrientation(
  event
) {

  if (
    gnssLost
  ) {

    return;

  }


  if (
    event.absolute &&
    typeof event.alpha === "number"
  ) {

    currentHeading =
      event.alpha;

  }

}


/* =========================================================
   ML BACKEND
========================================================= */

async function sendSequenceToML() {

  if (
    mlRequestRunning
  ) {

    return;

  }


  if (
    imuBuffer.length !== 50
  ) {

    return;

  }


  if (
    !BACKEND_URL
  ) {

    return;

  }


  mlRequestRunning =
    true;


  try {

    const response =
      await fetch(
        `${BACKEND_URL}/prototype-estimate`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              sequence:
                imuBuffer
            })
        }
      );


    if (!response.ok) {

      throw new Error(
        "ML backend unavailable"
      );

    }


    const data =
      await response.json();


    if (
      data.predicted_displacement_m
      !== undefined
    ) {

      /*
        The trained model can produce
        large raw displacement values.

        For the UI demo we constrain the
        displayed estimate to a sensible
        navigation range.
      */

      mlEstimate =
        Math.max(
          0,
          Math.min(
            12,
            Math.abs(
              Number(
                data.predicted_displacement_m
              ) || 0
            )
          )
        );


      filterCorrection =
        Math.min(
          driftMeters,
          mlEstimate * .4
        );


      updateAIMetrics();

    }


  } catch (error) {

    console.warn(
      "ML request:",
      error.message
    );

  } finally {

    mlRequestRunning =
      false;

  }

}


/* =========================================================
   GNSS LOSS
========================================================= */

async function simulateGnssLoss() {

  if (
    !routeCoordinates.length
  ) {

    alert(
      "Calculate a route first."
    );

    return;

  }


  /*
    If navigation hasn't started,
    start the selected mode first.
  */

  if (
    !navigationRunning
  ) {

    if (
      selectedMode ===
      "prototype"
    ) {

      startPrototypeMode();

      setTimeout(
        applyGnssLoss,
        400
      );

    } else {

      await startRealNavigation();

      setTimeout(
        applyGnssLoss,
        700
      );

    }

    return;

  }


  applyGnssLoss();

}


/* =========================================================
   APPLY GNSS LOSS
========================================================= */

function applyGnssLoss() {

  if (
    !navigationRunning
  ) {

    return;

  }


  gnssLost =
    true;


  document.body.classList.add(
    "gnss-loss"
  );


  if (routeLine) {

    routeLine.setStyle({
      color: "#ef4444"
    });

  }


  setVehicleIcon(true);


  navStatus.textContent =
    "GNSS LOST";


  headerStatus.textContent =
    "GNSS LOST";


  modeTitle.textContent =
    "GNSS LOST";


  modeSubtitle.textContent =
    "Dead Reckoning Active";


  modeIndicator.textContent =
    "DR ACTIVE";


  modeIndicator.className =
    "mode-indicator loss";


  guidanceInstruction.textContent =
    "Dead reckoning active";


  guidanceDistance.textContent =
    "GNSS signal unavailable";


  guidanceRoad.textContent =
    "AI + IMU estimation";


  aiStatus.textContent =
    "DEAD RECKONING ACTIVE";


  systemStatus.textContent =
    "GNSS lost — AI + filter active";


  driftMeters =
    Math.max(
      driftMeters,
      .15
    );


  /* Prototype continues route-driven.
     Real mode starts DR timer. */

  if (
    !prototypeMode
  ) {

    startDeadReckoning();

  }

}


/* =========================================================
   DEAD RECKONING TIMER
========================================================= */

function startDeadReckoning() {

  clearInterval(
    deadReckoningTimer
  );


  if (
    !currentPosition
  ) {

    return;

  }


  lastDeadReckoningPosition =
    [...currentPosition];


  deadReckoningTimer =
    setInterval(() => {

      if (
        !navigationRunning ||
        !gnssLost ||
        prototypeMode
      ) {

        return;

      }


      const speedMps =
        Math.max(
          2,
          currentSpeed / 3.6
        );


      const distance =
        speedMps;


      const next =
        movePoint(
          lastDeadReckoningPosition,
          currentHeading,
          distance
        );


      lastDeadReckoningPosition =
        [...next];


      currentPosition =
        [...next];


      if (vehicleMarker) {

        vehicleMarker.setLatLng(
          next
        );

      }


      driftMeters =
        Math.min(
          12,
          driftMeters + .10
        );


      mlEstimate =
        Math.min(
          12,
          Math.max(
            mlEstimate,
            driftMeters * .8
          )
        );


      filterCorrection =
        Math.min(
          driftMeters,
          mlEstimate * .4
        );


      updateAIMetrics();


      navStatus.textContent =
        "GNSS LOST";


      if (
        followVehicleEnabled
      ) {

        map.setView(
          next,
          automaticZoomEnabled
            ? 18
            : map.getZoom(),
          {
            animate: true,
            duration: .5
          }
        );

      }

    }, 1000);

}


/* =========================================================
   MOVE POINT
========================================================= */

function movePoint(
  point,
  bearing,
  distanceMeters
) {

  const R =
    6371000;


  const lat1 =
    point[0] *
    Math.PI / 180;


  const lon1 =
    point[1] *
    Math.PI / 180;


  const brng =
    bearing *
    Math.PI / 180;


  const angularDistance =
    distanceMeters / R;


  const lat2 =
    Math.asin(

      Math.sin(lat1) *
      Math.cos(angularDistance) +

      Math.cos(lat1) *
      Math.sin(angularDistance) *
      Math.cos(brng)

    );


  const lon2 =
    lon1 +

    Math.atan2(

      Math.sin(brng) *
      Math.sin(angularDistance) *
      Math.cos(lat1),

      Math.cos(angularDistance) -
      Math.sin(lat1) *
      Math.sin(lat2)

    );


  return [

    lat2 * 180 / Math.PI,

    lon2 * 180 / Math.PI

  ];

}


/* =========================================================
   RESTORE GNSS
========================================================= */

function restoreGnss() {

  gnssLost =
    false;


  document.body.classList.remove(
    "gnss-loss"
  );


  clearInterval(
    deadReckoningTimer
  );


  if (routeLine) {

    routeLine.setStyle({
      color: "#2563eb"
    });

  }


  setVehicleIcon(false);


  if (
    prototypeMode
  ) {

    modeTitle.textContent =
      "PROTOTYPE NAVIGATION";

    modeSubtitle.textContent =
      "Simulated GPS + IMU";

    modeIndicator.textContent =
      "SIMULATED";

    modeIndicator.className =
      "mode-indicator prototype";

    navStatus.textContent =
      "SIMULATED GNSS";

    headerStatus.textContent =
      "PROTOTYPE";

    aiStatus.textContent =
      "AI + FILTER ACTIVE";

    systemStatus.textContent =
      "GNSS restored";

  } else {

    modeTitle.textContent =
      "NORMAL NAVIGATION";

    modeSubtitle.textContent =
      "Real GPS + IMU";

    modeIndicator.textContent =
      "GNSS";

    modeIndicator.className =
      "mode-indicator";

    navStatus.textContent =
      "GNSS ACTIVE";

    headerStatus.textContent =
      navigationRunning
        ? "NAVIGATING"
        : "READY";

    aiStatus.textContent =
      "AI + FILTER ACTIVE";

    systemStatus.textContent =
      "GNSS restored";

  }


  guidanceInstruction.textContent =
    "GNSS signal restored";

  guidanceDistance.textContent =
    "Navigation resumed";

  guidanceRoad.textContent =
    "";


  /* Real GPS will update position again
     through watchPosition. */

}


/* =========================================================
   STOP MOVEMENT
========================================================= */

function stopMovementOnly() {

  clearInterval(
    prototypeTimer
  );

  clearInterval(
    deadReckoningTimer
  );


  prototypeTimer =
    null;

  deadReckoningTimer =
    null;


  if (
    gpsWatchId !== null
  ) {

    navigator.geolocation.clearWatch(
      gpsWatchId
    );

    gpsWatchId =
      null;

  }

}


/* =========================================================
   STOP NAVIGATION
========================================================= */

function stopNavigation() {

  stopMovementOnly();


  navigationRunning =
    false;

  navigationStarted =
    false;

  prototypeMode =
    false;

  gnssLost =
    false;


  document.body.classList.remove(
    "gnss-loss"
  );


  setVehicleIcon(false);


  speedValue.textContent =
    "0";

  headingValue.textContent =
    "0°";


  navStatus.textContent =
    "NOT NAVIGATING";


  headerStatus.textContent =
    "READY";


  modeTitle.textContent =
    "NORMAL NAVIGATION";


  modeSubtitle.textContent =
    "Real GPS + IMU";


  modeIndicator.textContent =
    "GNSS";


  modeIndicator.className =
    "mode-indicator";


  systemStatus.textContent =
    "System ready";


  aiStatus.textContent =
    "AI system ready";


  realImuStatus.textContent =
    "SENSOR IDLE";


  guidanceInstruction.textContent =
    routeCoordinates.length
      ? "Ready to navigate"
      : "Calculate a route to begin";


  guidanceDistance.textContent =
    routeCoordinates.length
      ? formatDistance(
          calculateTotalRouteDistance()
        )
      : "Awaiting route";


  guidanceRoad.textContent =
    "";


  clearInterval(
    deadReckoningTimer
  );

}


/* =========================================================
   REMOVE SENSOR LISTENERS
========================================================= */

function removeSensorListeners() {

  window.removeEventListener(
    "devicemotion",
    handleRealMotion,
    true
  );


  window.removeEventListener(
    "deviceorientation",
    handleRealOrientation,
    true
  );


  realSensorsStarted =
    false;

  orientationSensorsStarted =
    false;

}


/* =========================================================
   RECENTER
========================================================= */

function recenterMap() {

  if (
    vehicleMarker
  ) {

    const position =
      vehicleMarker.getLatLng();


    map.setView(
      [
        position.lat,
        position.lng
      ],
      18,
      {
        animate: true
      }
    );

    return;

  }


  if (
    currentPosition
  ) {

    map.setView(
      currentPosition,
      18,
      {
        animate: true
      }
    );

    return;

  }


  getCurrentLocation()
    .catch(() => {

      map.setView(
        [16.5062, 80.6480],
        13
      );

    });

}


/* =========================================================
   UI UPDATE
========================================================= */

function navigationInfoUpdate() {

  speedValue.textContent =
    Math.round(
      currentSpeed
    );


  headingValue.textContent =
    `${Math.round(
      currentHeading
    )}°`;

}


/* =========================================================
   PANEL CONTROL
========================================================= */

function openPanel(
  panelName
) {

  activePanel =
    panelName;


  document.querySelectorAll(
    ".panel"
  ).forEach(
    panel => {

      panel.classList.remove(
        "active-panel"
      );

    }
  );


  const target =
    document.getElementById(
      `${panelName}Panel`
    );


  if (target) {

    target.classList.add(
      "active-panel"
    );

  }


  document.querySelectorAll(
    ".bottom-nav-item"
  ).forEach(
    button => {

      button.classList.toggle(
        "active",
        button.dataset.panel ===
          panelName
      );

    }
  );


  bottomSheet.classList.remove(
    "hidden-sheet"
  );

}


/* =========================================================
   BOTTOM SHEET DRAG
========================================================= */

let dragStartY =
  0;

let dragCurrentY =
  0;

let dragging =
  false;


function startSheetDrag(
  event
) {

  dragging =
    true;


  dragStartY =
    event.touches
      ? event.touches[0].clientY
      : event.clientY;


  dragCurrentY =
    dragStartY;

}


function moveSheetDrag(
  event
) {

  if (!dragging) return;


  dragCurrentY =
    event.touches
      ? event.touches[0].clientY
      : event.clientY;

}


function endSheetDrag() {

  if (!dragging) return;


  const delta =
    dragCurrentY -
    dragStartY;


  dragging =
    false;


  if (
    delta > 50
  ) {

    bottomSheet.classList.add(
      "hidden-sheet"
    );

  } else if (
    delta < -50
  ) {

    bottomSheet.classList.remove(
      "hidden-sheet"
    );

  }

}


/* =========================================================
   EVENT LISTENERS
========================================================= */

document
  .getElementById(
    "calculateRouteBtn"
  )
  .addEventListener(
    "click",
    createRoute
  );


document
  .getElementById(
    "useLocationBtn"
  )
  .addEventListener(
    "click",
    async () => {

      try {

        await getCurrentLocation();

        systemStatus.textContent =
          "Current location loaded";

      } catch {

        alert(
          "Unable to get current location."
        );

      }

    }
  );


document
  .getElementById(
    "startRealBtn"
  )
  .addEventListener(
    "click",
    async () => {

      selectedMode =
        "real";

      await startRealNavigation();

    }
  );


document
  .getElementById(
    "prototypeBtn"
  )
  .addEventListener(
    "click",
    () => {

      selectedMode =
        "prototype";

      startPrototypeMode();

    }
  );


document
  .getElementById(
    "stopBtn"
  )
  .addEventListener(
    "click",
    stopNavigation
  );


document
  .getElementById(
    "simulateLossBtn"
  )
  .addEventListener(
    "click",
    simulateGnssLoss
  );


document
  .getElementById(
    "restoreGnssBtn"
  )
  .addEventListener(
    "click",
    restoreGnss
  );


document
  .getElementById(
    "recenterBtn"
  )
  .addEventListener(
    "click",
    recenterMap
  );


/* Bottom navigation */

document.querySelectorAll(
  ".bottom-nav-item"
).forEach(
  button => {

    button.addEventListener(
      "click",
      () => {

        openPanel(
          button.dataset.panel
        );

      }
    );

  }
);


/* Settings */

document
  .getElementById(
    "followToggle"
  )
  .addEventListener(
    "change",
    event => {

      followVehicleEnabled =
        event.target.checked;

    }
  );


document
  .getElementById(
    "zoomToggle"
  )
  .addEventListener(
    "change",
    event => {

      automaticZoomEnabled =
        event.target.checked;

    }
  );


document
  .getElementById(
    "themeToggle"
  )
  .addEventListener(
    "change",
    event => {

      document.body.classList.toggle(
        "dark-mode",
        event.target.checked
      );

    }
  );


/* Sheet dragging */

const sheetHandle =
  document.getElementById(
    "sheetHandleArea"
  );


sheetHandle.addEventListener(
  "touchstart",
  startSheetDrag,
  {
    passive: true
  }
);


sheetHandle.addEventListener(
  "touchmove",
  moveSheetDrag,
  {
    passive: true
  }
);


sheetHandle.addEventListener(
  "touchend",
  endSheetDrag
);


/* =========================================================
   STARTUP
========================================================= */

initializeMap();


openPanel(
  "navigate"
);


window.addEventListener(
  "beforeunload",
  () => {

    stopMovementOnly();

    removeSensorListeners();

  }
);


/* =========================================================
   INITIAL UI
========================================================= */

updateAIMetrics();


guidanceInstruction.textContent =
  "Calculate a route to begin";


guidanceDistance.textContent =
  "Awaiting route";


systemStatus.textContent =
  "System ready";