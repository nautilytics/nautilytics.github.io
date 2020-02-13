var NAUTILYTICS = NAUTILYTICS || {};
var flags = {};

var ringMat = new THREE.MeshLambertMaterial({
    color: 'rgb(0,255,255)',
    transparent: true,
    opacity: 0.2,
    blending: THREE.NormalBlending
});

const defaultFlag = "data/world-flags/noflag.gif";

// Preloader for logo
$(window).load(function () { // makes sure the whole site is loaded
    $(".statusBox").delay(1200).fadeOut(); // will first fade out the loading animation
    $("#preloader").delay(350).fadeOut("slow"); // will fade out the white DIV that covers the website.
});

function DataSphere(scene, x, y, z, radius, objectInformation, id) {

    if (arguments.length === 5) {
        this.name = "";

    } else {
        this.name = objectInformation.name;
    }

    var flagLookup = (flags[id] ? flags[id] : defaultFlag);
    var mat = new THREE.MeshLambertMaterial({
        transparent: true,
        opacity: .5,
        map: THREE.ImageUtils.loadTexture(flagLookup)
    });
    var tweenStyle = TWEEN.Easing.Cubic.InOut;

    var sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 10), mat);
    this.id = sphere.id;
    this.sphere = sphere;
    this.countryid = id;
    this.angle = 0;
    sphere.overdraw = true;
    scene.add(sphere);
    sphere.position.y = y;
    sphere.position.x = x;
    sphere.position.z = z;

    this.MoveTo = function (x, y, z) {
        var target = {x: x, y: y, z: z};
        var tween = new TWEEN.Tween(sphere.position).to(target, 700);
        tween.easing(tweenStyle);
        tween.start();
    };

    this.ScaleTo = function (radius) {
        var target = {x: radius, y: radius, z: radius};
        var tween = new TWEEN.Tween(sphere.scale).to(target, 700);
        tween.easing(tweenStyle);
        tween.start();
    };

    this.FadeTo = function (val) {

        var tweenValue = {opacity: mat.opacity};
        var targetValue = {opacity: val};

        var tween = new TWEEN.Tween(tweenValue).to(targetValue, 700);
        //tween.delay(2000);
        tween.easing(tweenStyle);
        tween.start();
        tween.onUpdate(function () {
            mat.opacity = tweenValue.opacity;
        });

    };
    this.SetAngle = function (angle) {

        this.angle = angle;

    };
}

NAUTILYTICS.SphereModel = new function () {
    // internal vars
    var camera,
        scene,
        renderer = null,
        canvas = null,
        context = null,
        controls,
        $container = $('#container'),
        meshLookup = {},
        width = $container.width(),
        height = $container.height(),
        spheres = [],

        radiusScale = d3.scaleLinear().range([25, 200]),
        heightScale = d3.scaleLinear().range([200, 800]),

        ringTop, ringBottom, ringMiddle,
        projector = new THREE.Projector(),
        raycaster = new THREE.Raycaster(),
        running = true,

        elementMetaData = {
            0: "Select Therapies", 1: "Energy generation from renewable and non-fossil sources",
            2: "Renewable energy generation", 3: "Energy generation from fuels of non-fossil origin",
            4: "Nanotechnology"
        },
        itemMetaData = {0: "Priority date", 1: "Application date"},

        currentYear,
        minYear,
        maxYear,
        patentData = {},
        years, elements,

        commasFormatter = d3.format(",.2f"),

        currentElement,
        currentItem,

        // Variables for spark line
        sparkWidth,
        sparkHeight,
        sparkMargin = {width: 5, height: 5},
        sparkx = d3.scaleLinear(),
        sparky = d3.scaleLinear(),
        spark,
        sparkline,
        sparkCircle,

        // Variables for comparison bar chart
        chartWidth = 320,
        chartHeight = 200,
        margin = 10,
        comparisonBarGroup,
        xScale = d3.scaleLinear()
            .range([0, chartWidth - margin - margin]),
        yScale = d3.scaleBand()
            .range([chartHeight - margin - margin, 0])
            .paddingInner(.02),
        xAxis = d3.axisTop()
            .scale(xScale)
            .ticks(4)
            .tickSize(-chartHeight + margin + margin),

        // Variables for the pie/donut chart
        radius = Math.min(chartWidth - margin - margin, chartHeight - margin - margin) / 2.5,
        inner = 43,
        colors = colorbrewer.Set1[5],
        arc = d3.arc().outerRadius(radius).innerRadius(inner),
        arcOver = d3.arc().outerRadius(radius + 7).innerRadius(inner + 7),
        pie = d3.pie().value(d => d.value),

        countries = {},
        countryLookups = {},
        countryDataObjects = [],
        currentUniqueCountries = {},
        sortedKeys = [],
        selectedData = {},
        percentChangeValues,
        searchOpen = false, // while searching, lock certain functionality
        currentHighlightedSphere,

        // Variables for mousing over objects and intersections
        mouse = new THREE.Vector2(),
        INTERSECTED,
        selectedCountryId,
        HIGHLIGHT_HOVER = 0xff0000,
        HIGHLIGHT_NONE = 0x000000,

        // constants
        NEAR = 1,
        FAR = 10000,
        SURFACE_WIDTH = 400,
        SURFACE_HEIGHT = 400;

    this.pause = function () {
        running = false;
    };

    this.play = function () {
        if (!running) {
            running = true;
            update();
        }
    };

    /**
     * Initializes the experiment
     */
    this.init = function () {

        // Stop the user clicking
        document.onselectstart = function () {
            return false;
        };

        // add listeners
        addEventListeners();

        // create our stuff
        if (createRenderer()) {
            addLights();

            // Load the model after all data has been loaded
            const loader = new THREE.JSONLoader(),
                ringScale = 11;

            loader.load("js/ring.js", function (geo) {
                ringTop = new THREE.Mesh(geo, ringMat);
                ringMiddle = new THREE.Mesh(geo, ringMat);
                ringBottom = new THREE.Mesh(geo, ringMat);

                // Top and bottom rings are fixed to the height range
                ringTop.scale.set(ringScale, ringScale, ringScale);
                ringTop.position.set(0, heightScale.range()[1], 0);

                ringBottom.scale.set(ringScale, ringScale, ringScale);
                ringBottom.position.set(0, heightScale.range()[0], 0);

                ringMiddle.scale.set(ringScale, ringScale, ringScale);

                scene.add(ringTop);
                scene.add(ringMiddle);
                scene.add(ringBottom);

                createObjects();
                setupCameraControls();

                // start rendering, which will do nothing until the image is dropped
                update();
            });
        } else {
            $('html').removeClass('webgl').addClass('no-webgl');
        }
    };

    function setupCameraControls() {
        controls = new THREE.OrbitControls(camera);
        controls.minDistance = 1000;
        controls.maxDistance = 3000;
        controls.minPolarAngle = .1; // radians
        controls.maxPolarAngle = Math.PI / 2 - .2;
        controls.distance = 1500;
    }

    /**
     * Simple handler function for the events we don't care about
     */
    function cancel(event) {
    }

    /**
     * Adds some basic lighting to the
     * scene. Only applies to the centres
     */
    function addLights() {
        const pointLight = new THREE.DirectionalLight(0xFFFFFF);

        pointLight.position.x = 0;
        pointLight.position.y = 800;
        pointLight.position.z = 0;

        pointLight.lookAt([0, 0, 0]);

        pointLight.castShadow = true;

        scene.add(pointLight);

        const ambientLight = new THREE.AmbientLight(0x333333);
        scene.add(ambientLight);
    }

    function descendingByValue(a, b) {
        return +a.value[currentItem] > +b.value[currentItem] ? -1 : +a.value[currentItem] < +b.value[currentItem] ? 1 : 0;
    }

    /**
     * Creates the objects we need based on the data we have
     */
    function createObjects() {
        Promise.all([
            d3.json('./data/oecd_patent_data_11.7.13.json'),
            d3.csv("./data/country_lookups.csv"),
            d3.csv("./data/high_res_flag_lookups.csv"),
        ])
            .then(([data, countryData, flagData]) => {
                    // Get patent data
                    patentData = data;
                    countryDataObjects = countryData;
                    // Get the years from the data and set the current year to the max year
                    years = d3.keys(patentData);
                    minYear = d3.min(years);
                    maxYear = d3.max(years);
                    currentYear = maxYear;
                    d3.select('.current-year').text(currentYear);

                    // Get the unique countries from the patent data
                    let uniqueCountries = d3.merge(years.map(function (d) {
                        const yearCountries = d3.merge(d3.values(patentData[d]).map(function (h) {
                            return d3.keys(h);
                        }));
                        return $.grep(yearCountries, function (v, k) {
                            return $.inArray(v, yearCountries) === k;
                        });
                    }));
                    uniqueCountries = $.grep(uniqueCountries, function (v, k) {
                        return $.inArray(v, uniqueCountries) === k;
                    });
                    currentUniqueCountries = uniqueCountries;

                    // Get the unique elements from the data and set the current element to the first element code
                    elements = d3.merge(years.map(function (d) {
                        return d3.keys(patentData[d]);
                    }));
                    elements = $.grep(elements, function (v, k) {
                        return $.inArray(v, elements) === k;
                    });
                    currentElement = elements[0];
                    d3.selectAll('.element-name').text(elementMetaData[currentElement]);

                    d3.select(".changeElement")
                        .select("select")
                        .on("change", onElementChange)
                        .selectAll("option")
                        .data(elements)
                        .enter()
                        .append("option")
                        .attr("value", function (d) {
                            return d;
                        })
                        .text(function (d) {
                            return elementMetaData[d];
                        });
                    $('.changeElement option[value=' + currentElement + ']').attr("selected", true);

                    // Get the unique items from the data and set the current item to the first item code
                    const items = ['0', '1'];
                    currentItem = items[0];
                    d3.selectAll('.item-name').text(itemMetaData[currentItem]);

                    d3.select(".changeItem")
                        .select("select")
                        .on("change", onItemChange)
                        .selectAll("option")
                        .data(items)
                        .enter()
                        .append("option")
                        .attr("value", d => d)
                        .text(d => itemMetaData[d]);
                    $('.changeItem option[value=' + currentItem + ']').attr("selected", true);

                    // Get flag lookups for appending to 3d objects
                    flagData.forEach(function (d) {
                        flags[d.id] = "data/world-flags/" + d.file_name + ".gif";
                    });

                    // Get country lookups for distance around the center object
                    populateCountryLookups(true);

                    // Create spheres for all the unique countries in the dataset
                    uniqueCountries.forEach(function (d) {
                        const tempSphere = new DataSphere(scene, 0, 0, 0, 10, countries[d], d);

                        // Create a sphere for every country
                        spheres.push(tempSphere);
                        meshLookup[d] = tempSphere;
                    });

                    // Transition the spheres to their respective positions
                    updateSelectedData();

                    // Create the basis for the first bar chart
                    comparisonBarGroup = d3.select('#bar-comparison svg')
                        .append("g")
                        .attr("transform", `translate(${margin},${margin})`);

                    // Create the svg container for the spark line
                    const container = $('#spark-container');
                    sparkWidth = container.width();
                    sparkHeight = container.height();
                    sparkx
                        .domain([0, years.length])
                        .range([0, sparkWidth - sparkMargin.width]);
                    sparky
                        .range([sparkHeight - sparkMargin.height, sparkMargin.height]);
                    spark = d3.select('#spark-container')
                        .append('svg')
                        .attr('class', 'spark');

                    sparkCircle = spark.selectAll('circle')
                        .data([0])
                        .enter()
                        .insert('svg:circle')
                        .style('visibility', 'hidden')
                        .attr('cx', sparkx(0))
                        .attr('cy', sparky(0))
                        .attr('r', 5);

                    sparkline = d3.line()
                        .defined(d => d)
                        .x(function (d, i) {
                            return sparkx(i);
                        })
                        .y(function (d) {
                            return sparky(d);
                        });

                    $("#countryDropDown").autocomplete({
                        source: d3.values(countries),
                        autofocus: true,
                        minlength: 1,
                        select: function (event, ui) {
                            const country = countryLookups[ui.item.value];
                            menuItemClick(country);
                        },
                        messages: {
                            noResults: '',
                            results: function () {
                            }
                        },
                        open: function () {
                            searchOpen = true;
                            controls.setSearching(true);
                        },
                        close: function () {
                            searchOpen = false;
                            controls.setSearching(false);
                        }
                    })
                        .focus(setTimeout(function () {
                            $('#countryDropDown').select()
                        }, 50))

                    populateLegend();
                }
            )
    }

    function populateCountryLookups(filterVisible) {
        countryDataObjects.forEach(function (d) {
            if (filterVisible) {
                // only add visible countries
                if ($.inArray(d.id, currentUniqueCountries) > -1) {
                    countries[d.id] = d.name;
                    countryLookups[d.name] = d.id;
                }
            } else {
                // no filtering, add all countries
                countries[d.id] = d.name;
                countryLookups[d.name] = d.id;
            }
        });
    }

    function menuItemClick(country) {
        var countrySphere = spheres.filter(function (sphere) {
            return sphere.countryid === country
        })[0];

        selectCountryLegend(countrySphere);
        if (currentHighlightedSphere) {
            removeCountryHighlight(currentHighlightedSphere);
        }
        selectCountryHighlight(countrySphere.sphere);

    }

    function drawSparkLine() {

        spark.style('visibility', 'visible');
        sparkCircle.style('visibility', 'visible');
        spark.selectAll('path').remove();

        var sparkData = years.map(function (d) {
            var tempData = patentData[d][currentElement][selectedCountryId];
            return (tempData) ? tempData[currentItem] : null;
        });
        sparky.domain(d3.extent(sparkData));
        var currentYearIndex = years.indexOf(String(currentYear));

        spark.append("path")
            .datum(sparkData)
            .attr("d", sparkline);

        spark.selectAll('circle')
            .data([sparkData[currentYearIndex]])
            .attr('cx', sparkx(currentYearIndex))
            .attr('cy', function (d, i) {
                return sparky(d ? d : sparky.domain()[0]);
            });
    }

    function updateSelectedData() {

        // Set the selected data based on the year and element selected
        selectedData = patentData[currentYear][currentElement];

        // Clear all dashboards on changes to drop downs
        clearDashboard();

        // Sort the entries for the selected year and element and only keep those with values for the selected item
        sortedKeys = d3.entries(selectedData).filter(function (d) {
            return d.value[currentItem];
        }).sort(descendingByValue).map(function (k) {
            return k.key;
        });
        d3.select('#number-countries').text(sortedKeys.length);

        var sortedKeysSet = d3.set(sortedKeys);
        spheres.forEach(function (d) {
            var opacity = 1;
            if (!sortedKeysSet.has(d.countryid)) {
                opacity = 0;
                d.MoveTo(0, 0, 0);
            }
            d.FadeTo(opacity);
        });

        // Get the domain to scale the radius of each sphere
        var extents = d3.extent(d3.values(selectedData).map(function (d) {
            return +d[currentItem];
        }));
        radiusScale.domain(extents);

        // Get the domain to place the spheres at a height representing their percentage change
        percentChangeValues = {};
        sortedKeys.forEach(function (d) {

            var percentChange = 0;
            if (currentYear !== minYear) {

                var previousYearForCountry = patentData[currentYear - 1][currentElement][d];
                var previousYearValue = 0;
                if (previousYearForCountry) {
                    previousYearValue = previousYearForCountry[currentItem];
                }

                var currentYearValue = selectedData[d][currentItem];
                if (previousYearValue && currentYearValue) {
                    percentChange = (currentYearValue - previousYearValue) / previousYearValue;
                }
            }
            percentChangeValues[d] = percentChange;
        });
        heightScale.domain(d3.extent(d3.values(percentChangeValues)));

        // Get maximum radius needed to complete the circle
        var circleRadiusSum = d3.sum(d3.values(selectedData).map(function (d) {
            return radiusScale(+d[currentItem]);
        }));

        // Create the spheres based on the countries for which we have distances from the center
        var angleDelta = 360 / sortedKeys.length;
        var minTradingAngle = 0;
        var angle = 0;
        sortedKeys.forEach(function (d) {

            var distanceFromCenter = 750;
            var height = heightScale(percentChangeValues[d]);

            var itemRadius = radiusScale(selectedData[d][currentItem]);
            var oldAngle = minTradingAngle;
            minTradingAngle += itemRadius / circleRadiusSum * 360;
            angle = (minTradingAngle + oldAngle) / 2; // place the object between the start and end angles
            var position = polarOffset({x: 0, y: 0}, distanceFromCenter, angle, height);
            var itemSphere = meshLookup[d];
            itemSphere.MoveTo(position.x, position.y, position.z);
            itemSphere.ScaleTo(itemRadius);
            itemSphere.SetAngle(angle);
        });
        populateLegend();
        updateCameraView();
        ringMiddle.position.set(0, heightScale(0), 0);
    }

    function polarOffset(origin, distance, angle, normalizedTradeValue) {

        var radianAngle = (Math.PI / 180) * angle;
        var x = origin.x + distance * Math.cos(radianAngle);
        var z = origin.y + distance * Math.sin(radianAngle);
        return {x: x, y: normalizedTradeValue, z: z};
    }

    function onElementChange() {

        // When the element is changed by the user
        currentElement = +this.value;

        // Change the year back to the max year
        currentYear = d3.max(years);
        d3.select('.current-year').text(currentYear);

        // Update the element name and the data on the screen
        d3.selectAll('.element-name').text(elementMetaData[currentElement]);
        updateSelectedData();
    }

    function onItemChange() {

        // When the item is changed by the user
        currentItem = +this.value;
        d3.selectAll('.item-name').text(itemMetaData[currentItem]);
        updateSelectedData();
    }

    function yearLeft() {

        currentYear--;

        if (currentYear < minYear) {
            currentYear = maxYear;
        }
        d3.select('.current-year').text(currentYear);
        updateSelectedData();
    }

    function yearRight() {

        currentYear++;

        if (currentYear > maxYear) {
            currentYear = minYear;
        }
        d3.select('.current-year').text(currentYear);
        updateSelectedData();
    }

    $('#year-left').click(function () {
        yearLeft();
    });

    $('#year-right').click(function () {
        yearRight();
    });

    /**
     * Creates the WebGL renderer
     */
    function createRenderer() {
        var ok = false;

        try {
            renderer = new THREE.WebGLRenderer();
            renderer.sortObjects = false;
            camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, NEAR, FAR);
            scene = new THREE.Scene();
            canvas = document.createElement('canvas');
            canvas.width = SURFACE_WIDTH;
            canvas.height = SURFACE_HEIGHT;
            context = canvas.getContext('2d');

            context.fillStyle = "#FFFFFF";
            context.beginPath();
            context.fillRect(0, 0, SURFACE_WIDTH, SURFACE_HEIGHT);
            context.closePath();
            context.fill();

            // position the camera
            camera.position.y = 2200;
            //camera.position.z = DEPTH;

            // start the renderer
            renderer.setSize(width, height);
            $container.append(renderer.domElement);

            //add shadow parameters
            renderer.shadowMapEnabled = true;
            renderer.shadowMapSoft = true;
            renderer.shadowCameraNear = 3;
            renderer.shadowCameraFar = camera.far;
            renderer.shadowCameraFov = 50;
            renderer.shadowMapBias = 0.0039;
            renderer.shadowMapDarkness = 0.5;
            renderer.shadowMapWidth = 1024;
            renderer.shadowMapHeight = 1024;


            ok = true;
        } catch (e) {
            ok = false;
        }

        return ok;
    }

    /**
     * Sets up the event listeners for DnD, the GUI and window resize
     */
    function addEventListeners() {
        // window event

        $(window).resize(callbacks.windowResize);
        $(window).keydown(callbacks.keyDown);

        // click handler
        $(document.body).mousemove(callbacks.mouseMove, false);
        $(document.body).mousedown(callbacks.mouseDown);
        $(document.body).mouseup(callbacks.mouseUp);
        $(document.body).click(callbacks.mouseClick);

        var container = $container[0];

        container.addEventListener('dragover', cancel, false);
        container.addEventListener('dragenter', cancel, false);
        container.addEventListener('dragexit', cancel, false);
    }

    function MouseCast() {
        if (searchOpen) return;
        // Find intersections
        var vector = new THREE.Vector3(mouse.x, mouse.y, 1);
        projector.unprojectVector(vector, camera);

        raycaster.set(camera.position, vector.sub(camera.position).normalize());

        var intersects = raycaster.intersectObjects(scene.children);

        if (intersects.length > 0) {

            if (INTERSECTED !== intersects[0].object) {

                // TODO - keep red lantern look until a new country sphere is hovered over
                if (INTERSECTED) {
                    INTERSECTED.material.emissive.setHex(HIGHLIGHT_NONE);
                }

                INTERSECTED = intersects[0].object;

                // Find the sphere with the same id as the intersected object
                var result = spheres.filter(function (sphere) {
                    return sphere.id === INTERSECTED.id
                })[0];

                if (result) {
                    var countryId = result.countryid;
                    if (selectedCountryId !== countryId) {
                        if (currentHighlightedSphere)
                            removeCountryHighlight(currentHighlightedSphere);
                        selectCountryHighlight(INTERSECTED);
                        selectCountryLegend(result);
                    }
                }
            }
        } else {
            if (INTERSECTED) {
                INTERSECTED.material.emissive.setHex(HIGHLIGHT_NONE);
            }

            INTERSECTED = null;

            $('#name').text("");
        }
        mouseUpDetected = false;
    }

    function selectCountryLegend(result) {
        const countryId = result.countryid;
        clearDashboard();
        $('#name').text(result.name);

        // Update flag on dashboard
        selectedCountryId = countryId;
        document.getElementById("flag1").src = (flags[countryId]) ?
            flags[countryId] : defaultFlag;

        // Update text on dashboard
        d3.selectAll(".country-name").text(countries[countryId]);
        d3.select('#percent-change').text((percentChangeValues[countryId] * 100).toFixed(2) + "%");

        if (selectedData[countryId])
            d3.select('#patent-applications').text(
                commasFormatter(selectedData[countryId][currentItem])
            );

        const indexOfCountryId = sortedKeys.indexOf(countryId);
        d3.select('#country-ranking').text(indexOfCountryId + 1);

        // Draw bar comparison chart
        drawBarComparisonChart(indexOfCountryId);

        // Draw patent breakdown chart
        drawPatentBreakdownPieChart();

        // Draw spark line
        drawSparkLine();
    }

    function selectCountryHighlight(sphereModel) {
        // Change the inside of the sphere to look like a red lantern
        currentHighlightedSphere = sphereModel;
        currentHighlightedSphere.material.emissive.setHex(HIGHLIGHT_HOVER);
    }

    function removeCountryHighlight(sphereModel) {
        sphereModel.material.emissive.setHex(HIGHLIGHT_NONE);
    }

    function clearDashboard() {

        // Clear all text, flags and images from dashboard
        document.getElementById("flag1").src = defaultFlag;
        d3.selectAll(".country-name").text("");
        d3.select('#percent-change').text("");
        d3.select('#patent-applications').text("");
        d3.select('#country-ranking').text("");

        // Clear spark line and circle from dashboard
        if (spark) {
            spark.selectAll('path').remove();
            sparkCircle.style('visibility', 'hidden');
        }

        // Clear comparison bar chart
        d3.selectAll('.bars rect').remove();
        d3.selectAll('.bars text').remove();
        d3.selectAll('.bars').remove();
        d3.selectAll('.axis').remove();

        // Clear pie chart
        d3.selectAll('.pie-chart').remove();
        d3.selectAll('.legend li').remove();
    }

    function drawPatentBreakdownPieChart() {

        var total = 0;
        var pieBreakdown = [];

        d3.keys(patentData[currentYear]).forEach(function (d) {
            var dataPoint = 0;
            var label = elementMetaData[d];
            var elementData = patentData[currentYear][d];
            var selectedCountryData = elementData[selectedCountryId];

            // Update the pie chart legend and arcs if values exist
            if (selectedCountryData) {
                dataPoint = (selectedCountryData[currentItem]) ? selectedCountryData[currentItem] : 0;

                if (dataPoint > 0) {

                    total += dataPoint;

                    // Insert into legend
                    const insertionText = "<li><i style='background-color:" + colors[d] + ";'></i>" + label + "</li>";
                    $('.legend').append(insertionText);
                    pieBreakdown.push({label, value: dataPoint, id: d});
                }
            }
        });

        if (pieBreakdown.length > 0) {
            var pieChart = d3.select('.pieChart .chart').append('svg')
                .data([pieBreakdown])
                .attr('class', 'pie-chart')
                .append("g")
                .attr("transform", "translate(" + radius * 1.1 + "," + radius * 1.1 + ")");


            var textTop = pieChart.append("text")
                    .attr("dy", ".35em")
                    .style("text-anchor", "middle")
                    .attr("class", "textTop")
                    .text("TOTAL")
                    .attr("y", -10),
                textBottom = pieChart.append("text")
                    .attr("dy", ".35em")
                    .style("text-anchor", "middle")
                    .attr("class", "textBottom")
                    .text(commasFormatter(total))
                    .attr("y", 10);

            var arcs = pieChart.selectAll("g.slice")
                .data(pie)
                .enter()
                .append("g")
                .attr("class", "slice")
                .on("mouseover", function (d) {

                    d3.select(this).select("path").transition()
                        .duration(200)
                        .attr("d", arcOver);

                    textTop.text(d3.select(this).datum().data.label);
                    textBottom.text(commasFormatter(d3.select(this).datum().data.value));
                })
                .on("mouseout", function (d) {

                    d3.select(this).select("path").transition()
                        .duration(100)
                        .attr("d", arc);

                    textTop.text("TOTAL");
                    textBottom.text(commasFormatter(total));
                });

            arcs.append("path")
                .attr("fill", function (d) {
                    return colors[+d.data.id];
                })
                .attr("d", arc);
        }
    }

    function drawBarComparisonChart(indexOfCountryId) {
        let comparisonKeys;
        const n = sortedKeys.length;

        if (indexOfCountryId > n - 3) { // at the top of spectrum
            comparisonKeys = d3.range(n - 5, n).map(function (d) {
                const id = sortedKeys[d];
                return {name: countries[id], value: selectedData[id][currentItem], id};
            });

        } else if (indexOfCountryId < 2) { // at the bottom of spectrum
            comparisonKeys = d3.range(0, 5).map(function (d) {
                const id = sortedKeys[d];
                return {name: countries[id], value: selectedData[id][currentItem], id};
            });
        } else { // everyone else
            comparisonKeys = d3.range(indexOfCountryId - 2, indexOfCountryId + 3).map(function (d) {
                const id = sortedKeys[d];
                return {name: countries[id], value: selectedData[id][currentItem], id};
            });
        }

        // Scale bars from 0 to the max of the closest countries
        xScale.domain([0, d3.max(comparisonKeys.map(d => +d.value))]);
        yScale.domain(comparisonKeys.map(d => d.id));

        const bar = comparisonBarGroup.append("g")
            .attr("class", "bars")
            .selectAll("rect")
            .data(comparisonKeys)
            .enter()
            .append("g")
            .attr("transform", d => `translate(0,${yScale(d.id)})`);

        bar.append("rect")
            .attr("height", yScale.bandwidth())
            .attr("width", d => xScale(+d.value))
            .style('fill', d => (d.id === selectedCountryId) ? 'red' : 'steelblue');

        bar.append("text")
            .attr("x", xScale.range()[1])
            .attr("y", yScale.bandwidth() / 2)
            .attr("dy", ".35em")
            .text(d => d.name);

        comparisonBarGroup.append("g")
            .attr("class", "axis")
            .call(xAxis)
            .select(".tick line")
            .style("stroke", "#000");
    }

    function update() {

        // Set up a request for a render
        requestAnimationFrame(render);
        MouseCast();
        controls.update();
        spheres.forEach(s => s.sphere.lookAt(camera.position));
    }

    function render() {
        // Renders the current state

        $("#dropdowns").mouseenter(function () {
            controls.enabled = false;
        }).mouseleave(function () {
            controls.enabled = true;
        });

        // Only render
        if (renderer) {
            renderer.render(scene, camera);
        }

        // set up the next frame
        if (running) {
            update();
            TWEEN.update();
        }
    }

    function updateCameraView() {
        if (camera) {
            width = $container.width();
            height = $container.height();
            camera.aspect = width / height;
            renderer.setSize(width, height);
            camera.updateProjectionMatrix();
        }
    }

    function populateLegend() {
        // Populate the radius and height legend with values and text
        var percentFormatter = d3.format(",.1%"),
            commaFormatter = d3.format(",.2f");

        $("#radiusHigh").text(commaFormatter(radiusScale.domain()[1]));
        $("#radiusMedium").text(commaFormatter((radiusScale.domain()[1] - radiusScale.domain()[0]) / 2));
        $("#radiusLow").text(commaFormatter(radiusScale.domain()[0]));

        $("#heightHigh").text(percentFormatter(heightScale.domain()[1]));
        $("#heightLow").text(percentFormatter(heightScale.domain()[0]));
    }

    /**
     * Our internal callbacks object - a neat
     * and tidy way to organise the various
     * callbacks in operation.
     */
    var mouseUpDetected = false;
    callbacks = {

        mouseMove: function (event) {
            mouse.x = ((event.clientX - $('#menu').width()) / $container.width()) * 2 - 1;
            mouse.y = -((event.clientY - $("#dropdowns").height()) / window.innerHeight) * 2 + 1;
        },
        mouseClick: function (event) {
            mouseUpDetected = true;
            MouseCast();
        },
        mouseDown: function (event) {
            mouseUpDetected = false;
        },
        mouseUp: function (event) {

        },
        //$("#dropdowns").height()
        windowResize: function () {
            updateCameraView();
        },
        keyDown: function (event) {
            if (searchOpen) return;
            if (camera) {
                switch (event.keyCode) {
                    case 37: // Left
                        //orbitValue -= 0.1;
                        //sphere.position.y -= 1;
                        break;

                    case 39: // Right
                        // orbitValue += 0.1;
                        break;
                }
            }
        }
    };
};

window.addEventListener("load", function () {
    NAUTILYTICS.SphereModel.init();
});
