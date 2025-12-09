document.addEventListener('DOMContentLoaded', () => {
  console.log("script.js loaded successfully");

  const mapCanvas = document.getElementById("mapCanvas");
  const orbitCanvas = document.getElementById("orbitCanvas");
  const mapCtx = mapCanvas ? mapCanvas.getContext("2d") : null;
  const orbitCtx = orbitCanvas ? orbitCanvas.getContext("2d") : null;

  const numSatellitesInput = document.getElementById("numSatellites");
  const altitudeSlider = document.getElementById("altitude");
  const speedSlider = document.getElementById("speed");
  const elevationSlider = document.getElementById("elevation");
  const targetCoverageInput = document.getElementById("targetCoverage");
  const maxLatitudeInput = document.getElementById("maxLatitude");
  const showCoverageCheckbox = document.getElementById("showCoverage");
  const showCoverageTraceCheckbox = document.getElementById("showCoverageTrace");
  const showTracksCheckbox = document.getElementById("showTracks");
  const referenceFrameCheckbox = document.getElementById("referenceFrame");
  const referenceFrameLabel = document.getElementById("referenceFrameLabel");
  const orbitCanvasTitle = document.getElementById("orbitCanvasTitle");
  const inclinationInput = document.getElementById("inclination");
  const allowRetrogradeOrbitsCheckbox = document.getElementById("allowRetrogradeOrbits");

  const altValue = document.getElementById("altValue");
  const speedValue = document.getElementById("speedValue");
  const elevValue = document.getElementById("elevValue");
  const periodOutput = document.getElementById("period");
  const coveragePercentOutput = document.getElementById("coveragePercent");
  const timeToTargetOutput = document.getElementById("timeToTarget");
  const pauseButton = document.getElementById("pauseButton");
  const clearMapButton = document.getElementById("clearMapButton");
  const optimizeButton = document.getElementById("optimizeButton");
  const saveConfigButton = document.getElementById("saveConfigButton");
  const loadConfigButton = document.getElementById("loadConfigButton");
  const loadConfigInput = document.getElementById("loadConfigInput");
  const optimizationProgress = document.getElementById("optimizationProgress");
  const currentIteration = document.getElementById("currentIteration");
  const totalIterations = document.getElementById("totalIterations");
  const bestTime = document.getElementById("bestTime");
  const progressFill = document.getElementById("progressFill");
  const initialTemperatureInput = document.getElementById("initialTemperature");
  const coolingRateInput = document.getElementById("coolingRate");
  const maxIterationsInput = document.getElementById("maxIterations");
  const satelliteModal = document.getElementById("satelliteModal");
  const closeModal = document.querySelector("#satelliteModal .close");
  const satelliteParams = document.getElementById("satelliteParams");
  const saveParamsButton = document.getElementById("saveParams");

  // Debug: Check if buttons are found
  if (!optimizeButton) console.error("Optimize button not found");
  if (!saveConfigButton) console.error("Save Config button not found");
  if (!loadConfigButton) console.error("Load Config button not found");
  if (!closeModal) console.error("Close modal button not found");
  if (!allowRetrogradeOrbitsCheckbox) console.error("Allow Retrograde Orbits checkbox not found");
  if (!satelliteModal) console.error("Satellite modal not found");

  const R_earth = 6371;
  const G = 6.67430e-11;
  const M = 5.972e24;
  const deg = Math.PI / 180;
  const earthRotationPeriod = 86164.1;

  let t = 0;
  let satellites = [];
  let lastAlt = altitudeSlider ? parseFloat(altitudeSlider.value) : 400;
  let isPaused = false;
  let startTime = 0;
  let targetReached = false;
  let isOptimizing = false;

  const traceCanvas = document.createElement("canvas");
  traceCanvas.width = mapCanvas ? mapCanvas.width : 800;
  traceCanvas.height = mapCanvas ? mapCanvas.height : 400;
  const traceCtx = traceCanvas.getContext("2d");

  let worldMap = new Image();
  worldMap.src = "world-map.png";

  let earthPoleImage = new Image();
  earthPoleImage.src = "earth-pole.png";

  function initializeSatellites(num, raanList = null, phaseList = null, inclinationRad = null) {
    try {
      satellites = [];
      const alt = parseFloat(altitudeSlider.value);
      let inclination = inclinationRad !== null ? inclinationRad : parseFloat(inclinationInput.value) * deg;
      const maxInclination = allowRetrogradeOrbitsCheckbox.checked ? 180 * deg : 90 * deg;
      if (isNaN(inclination) || inclination < 0) inclination = 45 * deg;
      if (inclination > maxInclination) inclination = maxInclination;
      inclinationInput.value = (inclination / deg).toFixed(2);

      for (let i = 0; i < num; i++) {
        satellites.push({
          inclination: inclination,
          raan: raanList ? raanList[i] : Math.random() * 0.5 * Math.PI,
          initialPhase: phaseList ? phaseList[i] : Math.random() * 0.5 * Math.PI,
          tail: [],
          altitude: alt,
          lastTheta: null
        });
      }
      t = 0;
      startTime = 0;
      targetReached = false;
      timeToTargetOutput.textContent = "Не досягнуто";
      traceCtx.clearRect(0, 0, traceCanvas.width, traceCanvas.height);
      traceCtx.fillStyle = 'rgba(0, 0, 0, 0)';
      traceCtx.fillRect(0, 0, traceCanvas.width, traceCanvas.height);
      console.log("traceCanvas initialized as transparent");
      coveragePercentOutput.textContent = '0';
    } catch (err) {
      console.error("Error in initializeSatellites:", err);
    }
  }

  function getOrbitalPeriod(alt_km) {
    const r = (R_earth + alt_km) * 1000;
    const T = 2 * Math.PI * Math.sqrt(r ** 3 / (G * M));
    return T;
  }

  function wrapLon(lon) {
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    return lon;
  }

  function getCoverageRadius(alt_km, min_elevation_deg) {
    const r = R_earth + alt_km;
    const min_elev_rad = min_elevation_deg * deg;
    const acosInput = Math.max(-1, Math.min(1, R_earth / r * Math.cos(min_elev_rad)));
    const rho = Math.acos(acosInput) - min_elev_rad;
    const gamma = Math.asin(r / R_earth * Math.sin(rho));
    const radius = R_earth * gamma;
    console.log(`Coverage radius: ${radius.toFixed(2)} km`); // Debug
    return isNaN(radius) || radius < 0 ? 0 : radius;
  }

  function getCoverageFootprint(lat, lon, radius_km) {
    const points = [];
    const numPoints = 32;
    const lat_rad = lat * deg;
    const lon_rad = lon * deg;
    const max_ang_radius = Math.PI / 2;
    const ang_radius = Math.min(radius_km / R_earth, max_ang_radius);

    if (ang_radius >= max_ang_radius) {
      console.warn('Coverage footprint is too large and has been capped to 90° angular radius.');
    }

    for (let i = 0; i < numPoints; i++) {
      const theta = (i / numPoints) * 2 * Math.PI;
      const new_lat = Math.asin(
        Math.sin(lat_rad) * Math.cos(ang_radius) +
        Math.cos(lat_rad) * Math.sin(ang_radius) * Math.cos(theta)
      );
      const new_lon = lon_rad + Math.atan2(
        Math.sin(theta) * Math.sin(ang_radius) * Math.cos(lat_rad),
        Math.cos(ang_radius) - Math.sin(lat_rad) * Math.sin(new_lat)
      );
      const clamped_lat = Math.max(-90, Math.min(90, new_lat / deg));
      points.push({
        lat: clamped_lat,
        lon: new_lon / deg
      });
    }
    return points;
  }

  function calculateCoveragePercentage() {
    try {
      const maxLat = Math.min(90, Math.max(0, parseFloat(maxLatitudeInput.value) || 80));
      const imageData = traceCtx.getImageData(0, 0, traceCanvas.width, traceCanvas.height);
      const data = imageData.data;
      let coveredPixels = 0;
      let totalWeightedPixels = 0;

      for (let y = 0; y < traceCanvas.height; y++) {
        const lat = (traceCanvas.height / 2 - y) * (180 / traceCanvas.height);
        if (Math.abs(lat) > maxLat) continue;
        const weight = Math.cos(lat * deg);
        for (let x = 0; x < traceCanvas.width; x++) {
          const index = (y * traceCanvas.width + x) * 4;
          const alpha = data[index + 3];
          if (alpha > 0) {
            coveredPixels += weight;
          }
          totalWeightedPixels += weight;
        }
      }

      const coveragePercent = totalWeightedPixels > 0 ? (coveredPixels / totalWeightedPixels) * 100 : 0;
      return coveragePercent;
    } catch (err) {
      console.error("Error in calculateCoveragePercentage:", err);
      return 0;
    }
  }

  function drawEarthImage(earthRot, centerX, centerY, earthRadius) {
    try {
      if (earthPoleImage.complete && earthPoleImage.naturalWidth > 0) {
        orbitCtx.save();
        orbitCtx.translate(centerX, centerY);
        orbitCtx.rotate(earthRot);
        orbitCtx.drawImage(
          earthPoleImage,
          -earthRadius,
          -earthRadius,
          earthRadius * 2,
          earthRadius * 2
        );
        orbitCtx.restore();
      } else {
        orbitCtx.fillStyle = '#0af';
        orbitCtx.beginPath();
        orbitCtx.arc(centerX, centerY, earthRadius, 0, 2 * Math.PI);
        orbitCtx.fill();
      }
    } catch (err) {
      console.error("Error in drawEarthImage:", err);
    }
  }

  function calculateSatellitePosition(alt, inc, raan, theta, t, earthRot) {
    try {
      const r = R_earth + alt;
      let x_orb = r * Math.cos(theta);
      let y_orb = r * Math.sin(theta);

      let x = x_orb * Math.cos(raan) - y_orb * Math.sin(raan) * Math.cos(inc);
      let y = x_orb * Math.sin(raan) + y_orb * Math.cos(raan) * Math.cos(inc);
      let z = y_orb * Math.sin(inc);

      let xe = Math.cos(earthRot) * x + Math.sin(earthRot) * y;
      let ye = -Math.sin(earthRot) * x + Math.cos(earthRot) * y;

      let lon = Math.atan2(ye, xe) / deg;
      let lat = Math.atan2(z, Math.sqrt(xe * xe + ye * ye)) / deg;

      lon = wrapLon(lon);
      let px = (lon + 180) / 360 * mapCanvas.width;
      let py = mapCanvas.height / 2 - lat / 180 * mapCanvas.height;

      return { x, y, z, lat, lon, px, py };
    } catch (err) {
      console.error("Error in calculateSatellitePosition:", err);
      return { x: 0, y: 0, z: 0, lat: 0, lon: 0, px: 0, py: 0 };
    }
  }

  function simulate() {
    try {
      if (isPaused || !mapCtx || !orbitCtx) return;

      const alt = parseFloat(altitudeSlider.value);
      const speed = parseFloat(speedSlider.value);
      const min_elev = parseFloat(elevationSlider.value);
      const targetCoverage = Math.min(100, Math.max(0, parseFloat(targetCoverageInput.value) || 90));

      altValue.textContent = alt;
      speedValue.textContent = speed;
      elevValue.textContent = min_elev;

      const T_sec = getOrbitalPeriod(alt);
      const T_days = T_sec / (60 * 60 * 24);
      const T_hours = T_sec / (60 * 60);
      periodOutput.textContent = `${T_days.toFixed(2)} діб (${T_hours.toFixed(2)} годин)`;

      const omega = 2 * Math.PI / T_sec;
      const earthRot = (2 * Math.PI / earthRotationPeriod) * t;
      const frameRotationAngle = referenceFrameCheckbox.checked ? -earthRot : 0;

      if (alt !== lastAlt) {
        satellites.forEach(sat => {
          sat.altitude = alt;
          sat.tail = [];
          sat.lastTheta = null;
        });
        traceCtx.clearRect(0, 0, traceCanvas.width, traceCanvas.height);
        traceCtx.fillStyle = 'rgba(0, 0, 0, 0)';
        traceCtx.fillRect(0, 0, traceCanvas.width, traceCanvas.height);
        console.log("traceCanvas reset as transparent in simulate");
        lastAlt = alt;
        startTime = t;
        targetReached = false;
        timeToTargetOutput.textContent = "Не досягнуто";
        coveragePercentOutput.textContent = '0';
      }

      satellites.forEach(sat => {
        const inc = sat.inclination;
        const raan = sat.raan;
        const precessionRate = -3/2 * (R_earth/(R_earth + alt))**2 * (2*Math.PI/earthRotationPeriod) * Math.cos(inc);
        const precessionAngle = precessionRate * t;

        const theta = omega * t + sat.initialPhase;

        if (showCoverageTraceCheckbox.checked) {
          const radius_km = getCoverageRadius(alt, min_elev);
          const maxAngularStep = 0.1;
          let startTheta = sat.lastTheta !== null ? sat.lastTheta : theta - omega * speed;
          const steps = Math.min(100, Math.ceil(Math.abs(theta - startTheta) / maxAngularStep));

          for (let i = 0; i <= steps; i++) {
            const interpTheta = startTheta + (theta - startTheta) * i / steps;
            const pos = calculateSatellitePosition(alt, inc, raan, interpTheta, t, earthRot);
            const footprint = getCoverageFootprint(pos.lat, pos.lon, radius_km);
            updateCoverageTrace(footprint, pos.lon);
          }
        }

        const pos = calculateSatellitePosition(alt, inc, raan, theta, t, earthRot);
        sat.tail.push({ x: pos.px, y: pos.py, lat: pos.lat, lon: pos.lon });

        sat.theta = theta;
        sat.x = pos.x;
        sat.y = pos.y;
        sat.z = pos.z;
        sat.lat = pos.lat;
        sat.lon = pos.lon;
        sat.precessionAngle = precessionAngle;
        sat.lastTheta = theta;
      });

      if (showCoverageTraceCheckbox.checked) {
        const currentCoverage = parseFloat(calculateCoveragePercentage());
        coveragePercentOutput.textContent = currentCoverage.toFixed(2);
        if (!targetReached && currentCoverage >= targetCoverage) {
          const elapsedSimTime = t - startTime;
          const periods = elapsedSimTime / T_sec;
          const elapsedDays = periods * T_days;
          const elapsedHours = elapsedSimTime / (60 * 60);
          timeToTargetOutput.textContent = `${elapsedDays.toFixed(2)} діб (${elapsedHours.toFixed(2)} годин)`;
          targetReached = true;
        }
      }

      drawMap(alt, min_elev);
      drawOrbit3D(earthRot, frameRotationAngle);
      t += speed;
      requestAnimationFrame(simulate);
    } catch (err) {
      console.error("Error in simulate:", err);
    }
  }

  function updateCoverageTrace(footprint, centerLon) {
    try {
      traceCtx.globalCompositeOperation = 'source-over';
      traceCtx.fillStyle = 'rgba(0, 0, 0, 1)';
      traceCtx.beginPath();
      footprint.forEach((point, i) => {
        let lon = point.lon;
        const lat = point.lat;
        while (lon - centerLon > 180) lon -= 360;
        while (lon - centerLon < -180) lon += 360;
        const px = (lon + 180) / 360 * traceCanvas.width;
        const py = traceCanvas.height / 2 - lat / 180 * mapCanvas.height;
        if (i === 0) {
          traceCtx.moveTo(px, py);
        } else {
          traceCtx.lineTo(px, py);
        }
      });
      traceCtx.closePath();
      traceCtx.fill();
    } catch (err) {
      console.error("Error in updateCoverageTrace:", err);
    }
  }

  function drawMap(alt, min_elev) {
    try {
      if (!mapCtx) return;

      mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
      mapCtx.drawImage(worldMap, 0, 0, mapCanvas.width, mapCanvas.height);

      if (showCoverageTraceCheckbox.checked) {
        mapCtx.drawImage(traceCanvas, 0, 0);
      }

      satellites.forEach((sat, index) => {
        if (showCoverageCheckbox.checked) {
          const radius_km = getCoverageRadius(alt, min_elev);
          const footprint = getCoverageFootprint(sat.lat, sat.lon, radius_km);

          mapCtx.fillStyle = `rgba(${index * 50 % 255}, 255, 0, 0.2)`;
          mapCtx.beginPath();

          footprint.forEach((point, i) => {
            let lon = point.lon;
            const lat = point.lat;
            while (lon - sat.lon > 180) lon -= 360;
            while (lon - sat.lon < -180) lon += 360;
            const px = (lon + 180) / 360 * mapCanvas.width;
            const py = mapCanvas.height / 2 - lat / 180 * mapCanvas.height;
            if (i === 0) {
              mapCtx.moveTo(px, py);
            } else {
              mapCtx.lineTo(px, py);
            }
          });

          mapCtx.closePath();
          mapCtx.fill();
        }

        if (showTracksCheckbox.checked) {
          mapCtx.strokeStyle = `hsl(${index * 360 / satellites.length}, 100%, 50%)`;
          mapCtx.beginPath();
          for (let i = 1; i < sat.tail.length; i++) {
            let a = sat.tail[i - 1], b = sat.tail[i];
            if (Math.abs(a.x - b.x) < mapCanvas.width / 2) {
              mapCtx.moveTo(a.x, a.y);
              mapCtx.lineTo(b.x, b.y);
            }
          }
          mapCtx.stroke();
        }

        let last = sat.tail[sat.tail.length - 1];
        mapCtx.fillStyle = `hsl(${index * 360 / satellites.length}, 100%, 50%)`;
        mapCtx.beginPath();
        mapCtx.arc(last.x, last.y, 4, 0, 2 * Math.PI);
        mapCtx.fill();
      });
    } catch (err) {
      console.error("Error in drawMap:", err);
    }
  }

  function drawOrbit3D(earthRot, frameRotationAngle) {
    try {
      if (!orbitCtx) return;

      orbitCtx.fillStyle = 'rgba(0,0,0,0.1)';
      orbitCtx.fillRect(0, 0, orbitCanvas.width, orbitCanvas.height);

      const centerX = orbitCanvas.width / 2;
      const centerY = orbitCanvas.height / 2;
      const maxOrbitRadius = R_earth + 4000;
      const scale = (orbitCanvas.width / 2) / maxOrbitRadius;
      const earthRadius = R_earth * scale;

      const isEarthFrame = referenceFrameCheckbox.checked;
      const continentRot = isEarthFrame ? 0 : earthRot;
      drawEarthImage(continentRot, centerX, centerY, earthRadius);

      orbitCtx.strokeStyle = 'rgba(255,255,255,0.2)';
      orbitCtx.lineWidth = 0.5;

      for (let lon = 0; lon < 360; lon += 20) {
        orbitCtx.beginPath();
        for (let lat = -90; lat <= 90; lat += 5) {
          const lonRad = (lon * deg + continentRot);
          const rad = earthRadius * Math.cos(lat * deg);
          const x = centerX + rad * Math.sin(lonRad);
          const y = centerY - rad * Math.cos(lonRad);
          if (lat === -90) orbitCtx.moveTo(x, y);
          else orbitCtx.lineTo(x, y);
        }
        orbitCtx.stroke();
      }

      for (let lat = -60; lat <= 60; lat += 20) {
        const r = earthRadius * Math.cos(lat * deg);
        orbitCtx.beginPath();
        orbitCtx.arc(centerX, centerY, r, 0, 2 * Math.PI);
        orbitCtx.stroke();
      }

      satellites.forEach((sat, index) => {
        orbitCtx.strokeStyle = `hsl(${index * 360 / satellites.length}, 100%, 50%)`;
        orbitCtx.lineWidth = 1.5;

        const orbitPoints = [];
        for (let a = 0; a <= 2 * Math.PI; a += 0.1) {
          let xo = (R_earth + sat.altitude) * Math.cos(a) * scale;
          let yo = (R_earth + sat.altitude) * Math.sin(a) * scale;

          let xr, yr, zr;
          let totalAngle = isEarthFrame ? (sat.raan + sat.precessionAngle + frameRotationAngle) : sat.raan;
          xr = xo * Math.cos(totalAngle) - yo * Math.sin(totalAngle) * Math.cos(sat.inclination);
          yr = xo * Math.sin(totalAngle) + yo * Math.cos(totalAngle) * Math.cos(sat.inclination);
          zr = yo * Math.sin(sat.inclination);

          orbitPoints.push({ x: xr, y: yr, z: zr });
        }

        orbitCtx.beginPath();
        let lastVisible = false;
        for (let i = 0; i < orbitPoints.length; i++) {
          const point = orbitPoints[i];
          const canvasDistance = Math.sqrt(point.x * point.x + point.y * point.y);
          const isVisible = point.z >= 0 || canvasDistance > earthRadius;

          const px = centerX + point.x;
          const py = centerY + point.y;

          if (i === 0) {
            if (isVisible) {
              orbitCtx.moveTo(px, py);
            }
            lastVisible = isVisible;
            continue;
          }

          if (isVisible && lastVisible) {
            orbitCtx.lineTo(px, py);
          } else if (isVisible && !lastVisible) {
            orbitCtx.moveTo(px, py);
          } else if (!isVisible && lastVisible) {
            orbitCtx.stroke();
            orbitCtx.beginPath();
          }

          lastVisible = isVisible;
        }
        orbitCtx.stroke();

        let xNorm, yNorm, zNorm;
        const r = R_earth + sat.altitude;
        const xo = r * Math.cos(sat.theta);
        const yo = r * Math.sin(sat.theta);
        const totalAngle = isEarthFrame ? (sat.raan + sat.precessionAngle + frameRotationAngle) : sat.raan;
        xNorm = (xo * Math.cos(totalAngle) - yo * Math.sin(totalAngle) * Math.cos(sat.inclination)) * scale;
        yNorm = (xo * Math.sin(totalAngle) + yo * Math.cos(totalAngle) * Math.cos(sat.inclination)) * scale;
        zNorm = (yo * Math.sin(sat.inclination)) * scale;

        const canvasDistance = Math.sqrt(xNorm * xNorm + yNorm * yNorm);
        const isVisible = zNorm >= 0 || canvasDistance > earthRadius;

        if (isVisible) {
          orbitCtx.fillStyle = `hsl(${index * 360 / satellites.length}, 100%, 50%)`;
          orbitCtx.beginPath();
          orbitCtx.arc(centerX + xNorm, centerY + yNorm, 5, 0, 2 * Math.PI);
          orbitCtx.fill();
        }
      });
    } catch (err) {
      console.error("Error in drawOrbit3D:", err);
    }
  }

  function showSatelliteParams(sat, index) {
    try {
      const alt = parseFloat(altitudeSlider.value);
      const min_elev = parseFloat(elevationSlider.value);
      const radius_km = getCoverageRadius(alt, min_elev);

      satelliteParams.innerHTML = `
        <div class="params-container">
          <div class="param-column">
            <h4>Налаштовувані параметри</h4>
            <label>Прямовисхідний вузол (градуси): <input type="number" id="satRaan" min="0" max="360" step="0.01" value="${(sat.raan / deg).toFixed(2)}"></label>
            <label>Початкова фаза (градуси): <input type="number" id="satInitialPhase" min="0" max="360" step="0.01" value="${(sat.initialPhase / deg).toFixed(2)}"></label>
          </div>
          <div class="param-column">
            <h4>Незмінні параметри</h4>
            <label>Номер супутника: <input type="text" value="${index + 1}" readonly></label>
            <label>Висота орбіти (км): <input type="text" value="${sat.altitude.toFixed(2)}" readonly></label>
            <label>Нахил орбіти (градуси): <input type="text" value="${(sat.inclination / deg).toFixed(2)}" readonly></label>
            <label>Поточна широта (градуси): <input type="text" value="${sat.lat.toFixed(2)}" readonly></label>
            <label>Поточна довгота (градуси): <input type="text" value="${sat.lon.toFixed(2)}" readonly></label>
            <label>Радіус зони покриття (км): <input type="text" value="${radius_km.toFixed(2)}" readonly></label>
          </div>
        </div>
      `;
      satelliteModal.style.display = "block";

      saveParamsButton.onclick = () => {
        try {
          const newRaan = parseFloat(document.getElementById("satRaan").value) * deg;
          const newInitialPhase = parseFloat(document.getElementById("satInitialPhase").value) * deg;

          if (
            !isNaN(newRaan) && newRaan >= 0 && newRaan <= 360 * deg &&
            !isNaN(newInitialPhase) && newInitialPhase >= 0 && newInitialPhase <= 360 * deg
          ) {
            sat.raan = newRaan;
            sat.initialPhase = newInitialPhase;
            sat.tail = [];
            sat.lastTheta = null;
            t = 0;
            startTime = 0;
            targetReached = false;
            timeToTargetOutput.textContent = "Не досягнуто";
            coveragePercentOutput.textContent = '0';
            traceCtx.clearRect(0, 0, traceCanvas.width, traceCanvas.height);
            traceCtx.fillStyle = 'rgba(0, 0, 0, 0)';
            traceCtx.fillRect(0, 0, traceCanvas.width, traceCanvas.height);
            console.log(`Updated satellite ${index + 1}: RAAN=${(newRaan / deg).toFixed(2)}°, InitialPhase=${(newInitialPhase / deg).toFixed(2)}°`);
            satelliteModal.style.display = "none";
            if (!isPaused) {
              requestAnimationFrame(simulate);
            }
          } else {
            alert("Будь ласка, введіть коректні значення параметрів (0–360 градусів).");
          }
        } catch (err) {
          console.error("Error in saveParamsButton.onclick:", err);
          alert("Помилка при збереженні параметрів: " + err.message);
        }
      };
    } catch (err) {
      console.error("Error in showSatelliteParams:", err);
      alert("Помилка при відображенні параметрів супутника: " + err.message);
    }
  }

  function saveConfiguration() {
    try {
      console.log("Save Config button clicked");
      const config = {
        numSatellites: parseInt(numSatellitesInput.value),
        altitude: parseFloat(altitudeSlider.value),
        inclination: parseFloat(inclinationInput.value),
        minElevation: parseFloat(elevationSlider.value),
        targetCoverage: parseFloat(targetCoverageInput.value),
        maxLatitude: parseFloat(maxLatitudeInput.value),
        speed: parseFloat(speedSlider.value),
        allowRetrogradeOrbits: allowRetrogradeOrbitsCheckbox.checked,
        satellites: satellites.map(sat => ({
          raan: sat.raan / deg,
          initialPhase: sat.initialPhase / deg
        }))
      };

      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'config.json';
      a.click();
      URL.revokeObjectURL(url);
      console.log("Configuration saved successfully");
    } catch (err) {
      console.error("Error in saveConfiguration:", err);
      alert("Помилка при збереженні конфігурації: " + err.message);
    }
  }

  function loadConfiguration(event) {
    try {
      console.log("Load Config button clicked");
      const file = event.target.files[0];
      if (!file) {
        console.warn("No file selected");
        return;
      }

      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const config = JSON.parse(e.target.result);

          if (
            typeof config.numSatellites !== 'number' || config.numSatellites < 1 || config.numSatellites > 10 ||
            typeof config.altitude !== 'number' || config.altitude < 200 || config.altitude > 4000 ||
            typeof config.inclination !== 'number' || config.inclination < 0 || config.inclination > 180 ||
            typeof config.minElevation !== 'number' || config.minElevation < 0 || config.minElevation > 90 ||
            typeof config.targetCoverage !== 'number' || config.targetCoverage < 0 || config.targetCoverage > 100 ||
            typeof config.maxLatitude !== 'number' || config.maxLatitude < 0 || config.maxLatitude > 90 ||
            typeof config.speed !== 'number' || config.speed < 1 || config.speed > 300 ||
            !Array.isArray(config.satellites) || config.satellites.length !== config.numSatellites ||
            config.satellites.some(sat => 
              typeof sat.raan !== 'number' || sat.raan < 0 || sat.raan > 360 ||
              typeof sat.initialPhase !== 'number' || sat.initialPhase < 0 || sat.initialPhase > 360
            )
          ) {
            console.error("Invalid configuration format");
            alert("Некоректний формат конфігураційного файлу.");
            return;
          }

          numSatellitesInput.value = config.numSatellites;
          altitudeSlider.value = config.altitude;
          altValue.textContent = config.altitude;
          inclinationInput.value = config.inclination;
          elevationSlider.value = config.minElevation;
          elevValue.textContent = config.minElevation;
          targetCoverageInput.value = config.targetCoverage;
          maxLatitudeInput.value = config.maxLatitude;
          speedSlider.value = config.speed;
          speedValue.textContent = config.speed;
          allowRetrogradeOrbitsCheckbox.checked = config.allowRetrogradeOrbits || false;

          const raanList = config.satellites.map(sat => sat.raan * deg);
          const phaseList = config.satellites.map(sat => sat.initialPhase * deg);
          initializeSatellites(config.numSatellites, raanList, phaseList, config.inclination * deg);

          console.log("Configuration loaded successfully");
          if (!isPaused) {
            requestAnimationFrame(simulate);
          }
        } catch (err) {
          console.error("Error parsing configuration:", err);
          alert("Помилка при завантаженні конфігурації: " + err.message);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error("Error in loadConfiguration:", err);
      alert("Помилка при завантаженні конфігурації: " + err.message);
    }
  }

  function evaluateCoverageTime(raanList, phaseList, inclination) {
    try {
      const num = parseInt(numSatellitesInput.value);
      const alt = parseFloat(altitudeSlider.value);
      const min_elev = parseFloat(elevationSlider.value);
      const targetCoverage = Math.min(100, Math.max(0, parseFloat(targetCoverageInput.value) || 90));
      const T_sec = getOrbitalPeriod(alt);
      const T_days = T_sec / (60 * 60 * 24);
      const omega = 2 * Math.PI / T_sec;
      const maxSimTime = T_sec * 20;
      const speed = 1000;

      if (traceCanvas.width === 0 || traceCanvas.height === 0) {
        console.error("Trace canvas has invalid dimensions:", traceCanvas.width, traceCanvas.height);
        return 1000;
      }

      console.log(`Evaluating coverage: numSat=${num}, alt=${alt}, minElev=${min_elev}, targetCov=${targetCoverage}`);

      let tempSatellites = [];
      for (let i = 0; i < num; i++) {
        tempSatellites.push({
          inclination: inclination,
          raan: raanList[i],
          initialPhase: phaseList[i],
          altitude: alt,
          lastTheta: null
        });
      }

      traceCtx.clearRect(0, 0, traceCanvas.width, traceCanvas.height);
      traceCtx.fillStyle = 'rgba(0, 0, 0, 0)';
      traceCtx.fillRect(0, 0, traceCanvas.width, traceCanvas.height);
      console.log("traceCanvas initialized as transparent in evaluateCoverageTime");

      let simTime = 0;
      while (simTime < maxSimTime) {
        const earthRot = (2 * Math.PI / earthRotationPeriod) * simTime;
        tempSatellites.forEach(sat => {
          const theta = omega * simTime + sat.initialPhase;
          const pos = calculateSatellitePosition(alt, sat.inclination, sat.raan, theta, simTime, earthRot);
          const radius_km = getCoverageRadius(alt, min_elev);
          const footprint = getCoverageFootprint(pos.lat, pos.lon, radius_km);
          updateCoverageTrace(footprint, pos.lon);
          sat.lastTheta = theta;
        });

        const currentCoverage = calculateCoveragePercentage();
        console.log(`SimTime=${simTime.toFixed(2)}s, Coverage=${currentCoverage.toFixed(2)}%`);

        if (currentCoverage >= targetCoverage) {
          const periods = simTime / T_sec;
          const days = periods * T_days;
          console.log(`Target coverage reached at ${days.toFixed(2)} days`);
          return days;
        }

        simTime += speed;
      }

      console.warn(`Target coverage not reached after ${maxSimTime.toFixed(2)}s`);
      return 1000;
    } catch (err) {
      console.error("Error in evaluateCoverageTime:", err);
      return 1000;
    }
  }

  function simulatedAnnealing() {
    try {
      console.log("Starting simulated annealing");
      const num = parseInt(numSatellitesInput.value);
      let inclination = parseFloat(inclinationInput.value) * deg;
      let raanList = satellites.map(sat => sat.raan);
      let phaseList = satellites.map(sat => sat.initialPhase);
      let bestInclination = inclination;
      let bestRaanList = [...raanList];
      let bestPhaseList = [...phaseList];
      let initialTime = evaluateCoverageTime(raanList, phaseList, inclination);
      let bestTimeValue = initialTime;
      let currentTime = initialTime;
      let firstValidTime = null; // Store first valid optimization result

      const initialTemperature = parseFloat(initialTemperatureInput.value) || 100;
      const coolingRate = parseFloat(coolingRateInput.value) || 0.95;
      const maxIterations = parseInt(maxIterationsInput.value) || 500;
      let temperature = initialTemperature;
      const minTemperature = 0.1;
      let iteration = 0;

      // Calculate inclination bounds based on maxLatitude and coverage radius
      const maxLat = Math.min(90, Math.max(0, parseFloat(maxLatitudeInput.value) || 80));
      const alt = parseFloat(altitudeSlider.value);
      const min_elev = parseFloat(elevationSlider.value);
      const radius_km = getCoverageRadius(alt, min_elev);
      const angularRadiusDeg = (radius_km / R_earth) * (180 / Math.PI);
      const maxInclinationDeg = allowRetrogradeOrbitsCheckbox.checked ? 180 : Math.min(90, maxLat + angularRadiusDeg);
      console.log(`Inclination bounds: [0°, ${maxInclinationDeg.toFixed(2)}°], maxLat=${maxLat}°, angularRadius=${angularRadiusDeg.toFixed(2)}°, retrograde=${allowRetrogradeOrbitsCheckbox.checked}`);

      if (isNaN(num) || num < 1 || num > 10) {
        console.error("Invalid number of satellites:", num);
        alert("Некоректна кількість супутників");
        optimizeButton.disabled = false;
        optimizeButton.textContent = 'Оптимізувати';
        isOptimizing = false;
        return;
      }
      if (isNaN(initialTemperature) || isNaN(coolingRate) || isNaN(maxIterations)) {
        console.error("Invalid optimization parameters", { initialTemperature, coolingRate, maxIterations });
        alert("Некоректні параметри оптимізації");
        optimizeButton.disabled = false;
        optimizeButton.textContent = 'Оптимізувати';
        isOptimizing = false;
        return;
      }

      optimizeButton.textContent = 'Стоп';
      optimizeButton.disabled = false;
      optimizationProgress.style.display = 'block';
      currentIteration.textContent = '0';
      totalIterations.textContent = maxIterations;
      bestTime.textContent = initialTime < 1000 
        ? `Час покращено на ${((initialTime - bestTimeValue) / initialTime * 100).toFixed(2)}%` 
        : 'N/A';
      progressFill.style.width = '0%';

      console.log("Optimization parameters:", {
        numSatellites: num,
        initialInclination: (inclination / deg).toFixed(2),
        maxInclination: maxInclinationDeg.toFixed(2),
        initialTemperature,
        coolingRate,
        maxIterations,
        initialTime: initialTime < 1000 ? initialTime.toFixed(2) : 'N/A'
      });

      function step() {
        try {
          if (!isOptimizing || temperature <= minTemperature || iteration >= maxIterations) {
            initializeSatellites(num, bestRaanList, bestPhaseList, bestInclination);
            optimizeButton.textContent = 'Оптимізувати';
            optimizeButton.disabled = false;
            optimizationProgress.style.display = 'none';
            isOptimizing = false;
            if (bestTimeValue < 1000) {
              const bestHours = bestTimeValue * 24;
              timeToTargetOutput.textContent = `${bestTimeValue.toFixed(2)} діб (${bestHours.toFixed(2)} годин)`;
              inclinationInput.value = (bestInclination / deg).toFixed(2); // Update UI with optimized inclination
            } else {
              timeToTargetOutput.textContent = "Не досягнуто (оптимізація не знайшла рішення)";
              console.warn("Optimization failed to find a solution");
            }
            console.log("Optimization completed", {
              finalBestTime: bestTimeValue < 1000 ? bestTimeValue.toFixed(2) : 'N/A',
              finalInclination: (bestInclination / deg).toFixed(2)
            });
            if (!isPaused) {
              requestAnimationFrame(simulate);
            }
            return;
          }

          let newInclination = inclination;
          const newRaanList = [...raanList];
          const newPhaseList = [...phaseList];
          const paramType = Math.random();
          let changeType = '';
          let changeIdx = -1;
          let delta = 0;

          if (paramType < 0.33) {
            changeType = 'inclination';
            delta = (Math.random() - 0.5) * 60 * deg; // Increased delta to explore wider range
            newInclination = Math.max(0, Math.min(maxInclinationDeg * deg, inclination + delta));
          } else if (paramType < 0.66) {
            changeType = 'raan';
            changeIdx = Math.floor(Math.random() * num);
            delta = (Math.random() - 0.5) * Math.PI; // Increased delta for RAAN
            newRaanList[changeIdx] = (newRaanList[changeIdx] + delta) % (2 * Math.PI);
            if (newRaanList[changeIdx] < 0) newRaanList[changeIdx] += 2 * Math.PI;
          } else {
            changeType = 'phase';
            changeIdx = Math.floor(Math.random() * num);
            delta = (Math.random() - 0.5) * Math.PI; // Increased delta for phase
            newPhaseList[changeIdx] = (newPhaseList[changeIdx] + delta) % (2 * Math.PI);
            if (newPhaseList[changeIdx] < 0) newPhaseList[changeIdx] += 2 * Math.PI;
          }

          const newTime = evaluateCoverageTime(newRaanList, newPhaseList, newInclination);
          const deltaE = newTime - currentTime;

          console.log(`Iteration ${iteration}:`, {
            changeType,
            changeIdx,
            delta: (delta / deg).toFixed(2),
            newTime: newTime < 1000 ? newTime.toFixed(2) : 'N/A',
            deltaE: deltaE.toFixed(2),
            currentTime: currentTime < 1000 ? currentTime.toFixed(2) : 'N/A',
            bestTimeValue: bestTimeValue < 1000 ? bestTimeValue.toFixed(2) : 'N/A',
            temperature: temperature.toFixed(2),
            newInclination: (newInclination / deg).toFixed(2)
          });

          const acceptProb = deltaE <= 0 ? 1 : Math.exp(-deltaE / temperature);
          console.log(`Accept probability: ${acceptProb.toFixed(4)}`);
          if (deltaE <= 0 || Math.random() < acceptProb) {
            inclination = newInclination;
            raanList = [...newRaanList];
            phaseList = [...newPhaseList];
            currentTime = newTime;
            console.log(`Accepted: newTime=${newTime < 1000 ? newTime.toFixed(2) : 'N/A'}`);
          }

          if (newTime < bestTimeValue || bestTimeValue >= 1000) {
            bestTimeValue = newTime;
            bestInclination = newInclination;
            bestRaanList = [...newRaanList];
            bestPhaseList = [...newPhaseList];
            // Store first valid time if not set and newTime is valid
            if (firstValidTime === null && newTime < 1000) {
              firstValidTime = newTime;
              console.log(`First valid time set: ${firstValidTime.toFixed(2)} days`);
            }
            // Update bestTime text
            if (bestTimeValue < 1000) {
              if (initialTime < 1000) {
                bestTime.textContent = `Час покращено на ${((initialTime - bestTimeValue) / initialTime * 100).toFixed(2)}%`;
              } else if (firstValidTime !== null) {
                bestTime.textContent = `Час покращено на ${((firstValidTime - bestTimeValue) / firstValidTime * 100).toFixed(2)}%`;
              } else {
                bestTime.textContent = `${bestTimeValue.toFixed(2)} діб`;
              }
            } else {
              bestTime.textContent = 'N/A';
            }
            console.log(`New best time at iteration ${iteration}: ${bestTimeValue < 1000 ? bestTimeValue.toFixed(2) : 'N/A'} days`);
          }

          temperature *= coolingRate;
          iteration++;
          currentIteration.textContent = iteration;
          progressFill.style.width = `${(iteration / maxIterations) * 100}%`;
          setTimeout(step, 0);
        } catch (err) {
          console.error("Error in simulatedAnnealing step:", err);
          optimizeButton.textContent = 'Оптимізувати';
          optimizeButton.disabled = false;
          optimizationProgress.style.display = 'none';
          isOptimizing = false;
          alert("Помилка під час оптимізації: " + err.message);
        }
      }

      isOptimizing = true;
      step();
    } catch (err) {
      console.error("Error in simulatedAnnealing:", err);
      optimizeButton.textContent = 'Оптимізувати';
      optimizeButton.disabled = false;
      optimizationProgress.style.display = 'none';
      isOptimizing = false;
      alert("Помилка при запуску оптимізації: " + err.message);
    }
  }

  if (optimizeButton) {
    optimizeButton.addEventListener('click', () => {
      console.log("Optimize button clicked");
      if (isOptimizing) {
        console.log("Stopping optimization");
        isOptimizing = false;
      } else {
        if (!isPaused) {
          isPaused = true;
          pauseButton.textContent = 'Відновити';
        }
        simulatedAnnealing();
      }
    });
  }

  if (saveConfigButton) {
    saveConfigButton.addEventListener('click', () => {
      console.log("Save Config button clicked");
      saveConfiguration();
    });
  }

  if (loadConfigButton && loadConfigInput) {
    loadConfigButton.addEventListener('click', () => {
      console.log("Load Config button clicked");
      loadConfigInput.click();
    });
    loadConfigInput.addEventListener('change', loadConfiguration);
  }

  if (mapCanvas) {
    mapCanvas.addEventListener('click', (event) => {
      try {
        if (!isPaused) return;

        const rect = mapCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const hitRadius = 10;

        let closestSat = null;
        let minDistance = Infinity;

        satellites.forEach((sat, index) => {
          const last = sat.tail[sat.tail.length - 1];
          if (!last) return;
          const dx = x - last.x;
          const dy = y - last.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < minDistance) {
            minDistance = distance;
            closestSat = { sat, index };
          }
        });

        if (closestSat && minDistance <= hitRadius) {
          showSatelliteParams(closestSat.sat, closestSat.index);
        }
      } catch (err) {
        console.error("Error in mapCanvas click:", err);
        alert("Помилка при виборі супутника: " + err.message);
      }
    });
  }

  if (closeModal) {
    closeModal.addEventListener('click', () => {
      try {
        satelliteModal.style.display = "none";
      } catch (err) {
        console.error("Error in closeModal click:", err);
      }
    });
  }

  if (satelliteModal) {
    window.addEventListener('click', (event) => {
      try {
        if (event.target === satelliteModal) {
          satelliteModal.style.display = "none";
        }
      } catch (err) {
        console.error("Error in window click for modal:", err);
      }
    });
  }

  if (speedSlider) {
    speedSlider.addEventListener('input', function() {
      try {
        speedValue.textContent = this.value;
      } catch (err) {
        console.error("Error in speedSlider input:", err);
      }
    });
  }

  if (elevationSlider) {
    elevationSlider.addEventListener('input', function() {
      try {
        elevValue.textContent = this.value;
      } catch (err) {
        console.error("Error in elevationSlider input:", err);
      }
    });
  }

  if (numSatellitesInput) {
    numSatellitesInput.addEventListener('input', function() {
      try {
        let num = parseInt(this.value);
        if (isNaN(num) || num < 1) num = 1;
        if (num > 10) num = 10;
        this.value = num;
        initializeSatellites(num);
      } catch (err) {
        console.error("Error in numSatellitesInput input:", err);
      }
    });
  }

  if (altitudeSlider) {
    altitudeSlider.addEventListener('input', function() {
      try {
        altValue.textContent = this.value;
        coveragePercentOutput.textContent = calculateCoveragePercentage().toFixed(2);
      } catch (err) {
        console.error("Error in altitudeSlider input:", err);
      }
    });
  }

  if (inclinationInput) {
    inclinationInput.addEventListener('input', function() {
      try {
        let value = parseFloat(this.value);
        if (isNaN(value) || value < 0) value = 0;
        const maxInclination = allowRetrogradeOrbitsCheckbox.checked ? 180 : 90;
        if (value > maxInclination) value = maxInclination;
        this.value = value;
        initializeSatellites(parseInt(numSatellitesInput.value));
      } catch (err) {
        console.error("Error in inclinationInput input:", err);
      }
    });
  }

  if (targetCoverageInput) {
    targetCoverageInput.addEventListener('input', function() {
      try {
        let value = parseFloat(this.value);
        if (isNaN(value) || value < 0) value = 0;
        if (value > 100) value = 100;
        this.value = value;
        targetReached = false;
        timeToTargetOutput.textContent = "Не досягнуто";
      } catch (err) {
        console.error("Error in targetCoverageInput input:", err);
      }
    });
  }

  if (maxLatitudeInput) {
    maxLatitudeInput.addEventListener('input', function() {
      try {
        let value = parseFloat(this.value);
        if (isNaN(value) || value < 0) value = 0;
        if (value > 90) value = 90;
        this.value = value;
        coveragePercentOutput.textContent = calculateCoveragePercentage().toFixed(2);
      } catch (err) {
        console.error("Error in maxLatitudeInput input:", err);
      }
    });
  }

  if (pauseButton) {
    pauseButton.addEventListener('click', function() {
      try {
        if (isPaused) {
          isPaused = false;
          pauseButton.textContent = 'Пауза';
          requestAnimationFrame(simulate);
        } else {
          isPaused = true;
          pauseButton.textContent = 'Відновити';
        }
      } catch (err) {
        console.error("Error in pauseButton click:", err);
      }
    });
  }

  if (clearMapButton) {
    clearMapButton.addEventListener('click', function() {
      try {
        satellites.forEach(sat => {
          sat.tail = [];
          sat.lastTheta = null;
        });
        traceCtx.clearRect(0, 0, traceCanvas.width, traceCanvas.height);
        traceCtx.fillStyle = 'rgba(0, 0, 0, 0)';
        traceCtx.fillRect(0, 0, traceCanvas.width, traceCanvas.height);
        console.log("traceCanvas cleared as transparent in clearMapButton");
        coveragePercentOutput.textContent = '0';
        startTime = t;
        targetReached = false;
        timeToTargetOutput.textContent = "Не досягнуто";
      } catch (err) {
        console.error("Error in clearMapButton click:", err);
      }
    });
  }

  if (referenceFrameCheckbox) {
    referenceFrameCheckbox.addEventListener('change', function() {
      try {
        const isEarthFrame = this.checked;
        referenceFrameLabel.textContent = isEarthFrame ? 'Земна' : 'Зоряна';
        orbitCanvasTitle.textContent = isEarthFrame
          ? 'Обертання площини орбіт у неінерціальній системі відліку Землі'
          : 'Відсутність обертання площини орбіт в інерціальній системі відліку (зоряній)';
      } catch (err) {
        console.error("Error in referenceFrameCheckbox change:", err);
      }
    });
  }

  if (initialTemperatureInput) {
    initialTemperatureInput.addEventListener('input', function() {
      try {
        let value = parseFloat(this.value);
        if (isNaN(value) || value < 100) value = 100;
        if (value > 10000) value = 10000;
        this.value = value;
      } catch (err) {
        console.error("Error in initialTemperatureInput input:", err);
      }
    });
  }

  if (coolingRateInput) {
    coolingRateInput.addEventListener('input', function() {
      try {
        let value = parseFloat(this.value);
        if (isNaN(value) || value < 0.9) value = 0.9;
        if (value > 0.999) value = 0.999;
        this.value = value;
      } catch (err) {
        console.error("Error in coolingRateInput input:", err);
      }
    });
  }

  if (maxIterationsInput) {
    maxIterationsInput.addEventListener('input', function() {
      try {
        let value = parseInt(this.value);
        if (isNaN(value) || value < 100) value = 100;
        if (value > 2000) value = 2000;
        this.value = value;
      } catch (err) {
        console.error("Error in maxIterationsInput input:", err);
      }
    });
  }

  let worldMapLoaded = false;
  let earthPoleImageLoaded = false;

  worldMap.onload = () => {
    console.log("World map image loaded successfully.");
    worldMapLoaded = true;
    if (worldMapLoaded && earthPoleImageLoaded) {
      initializeSatellites(parseInt(numSatellitesInput.value));
      simulate();
    }
  };

  worldMap.onerror = () => {
    console.error("Failed to load world map image. Check file path or format.");
    worldMapLoaded = true;
    if (worldMapLoaded && earthPoleImageLoaded) {
      initializeSatellites(parseInt(numSatellitesInput.value));
      simulate();
    }
  };

  earthPoleImage.onload = () => {
    console.log("Earth pole image loaded successfully.");
    earthPoleImageLoaded = true;
    if (worldMapLoaded && earthPoleImageLoaded) {
      initializeSatellites(parseInt(numSatellitesInput.value));
      simulate();
    }
  };

  earthPoleImage.onerror = () => {
    console.error("Failed to load earth-pole.png. Ensure the file is in the same directory, named exactly 'earth-pole.png', and is a valid PNG image.");
    earthPoleImageLoaded = true;
    if (worldMapLoaded && earthPoleImageLoaded) {
      initializeSatellites(parseInt(numSatellitesInput.value));
      simulate();
    }
  };

  if (worldMap.complete && worldMap.naturalWidth > 0) {
    worldMapLoaded = true;
  } else if (worldMap.naturalWidth === 0) {
    console.error("World map image failed to load or is invalid.");
    worldMapLoaded = true;
  }
  if (earthPoleImage.complete && earthPoleImage.naturalWidth > 0) {
    earthPoleImageLoaded = true;
  } else if (earthPoleImage.naturalWidth === 0) {
    console.error("Earth pole image failed to load or is invalid.");
    earthPoleImageLoaded = true;
  }
  if (worldMapLoaded && earthPoleImageLoaded) {
    initializeSatellites(parseInt(numSatellitesInput.value));
    simulate();
  }
});