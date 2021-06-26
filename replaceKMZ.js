const fs = require('fs');
const JSZip = require('jszip');
const { DOMParser } = require('xmlDom');
const { XMLSerializer } = require('xmlDom');
const parseKML = require('parse-kml');

var turf = require('turf');
var union = require('@turf/union');
var dissolve = require('@turf/dissolve');
var xpath = require('xpath');
var format = require('xml-formatter');
const minifyXML = require("minify-xml").minify;

(async () => {
    var files = fs.readdirSync("_input")
    var logString = ""
    for (let i = 0; i < files.length; i++) { //
        //try {
            var dom = await importKmz("_input/" + files[i]);
            var data = await extractKmzData(dom);
            await createNewKmz(data);
            logString += `"${data.name}", "Successfully Exported" \r\n`
        // } catch (error) {
        //     logString += `"${data.name}", "${error}" \r\n`
        //     console.log(`%c${data.name}, ${error}`, "color:red")
        // }
        fs.writeFileSync("_logs/log.csv", logString)
    }
  })();

// Takes in a path to a file, returns the KML file to edit as a DOM object
async function importKmz(path){
    // Read the KMZ file
    const file = fs.readFileSync(path);

    const zip = new JSZip();
    // Load the KMZ file into JSZip 
    await zip.loadAsync(file)

    console.log("KML Loaded: " + path)
    // For each file in the unzipped KMZ
    for (let i = 0; i < Object.keys(zip.files).length; i++) {
        // If the file is a kml file (there should only be one)
        if(Object.keys(zip.files)[i].match(/\.[0-9a-z]+$/i)[0] == '.kml'){
            ///////////////////////////////
            // Open and convert the file //
            ///////////////////////////////

            // Convert the file to a string
            var document = await zip.file(Object.keys(zip.files)[i]).async("string")
            const startingStringLength = document.length

            // Parse the KML string using an XML parser
            const oldDom = new DOMParser().parseFromString(document)
            return oldDom
        }
    }
}



////////////////////////////////
// Extract data from the file //
////////////////////////////////
async function extractKmzData(oldDom){
    // Define a configuration object that determines how the KML elements are separated
    var kmlData = {
        elements: [
            {name: 'Curbs',
             type: 'line',
             inputColor: 'ff003efe',
             lineColor: 'ff000000'},

            {name: 'Grid',
            type: 'line',
            inputColor: 'ff7f7f7f',
            lineColor: 'ff7f7f7f'},

            {name: 'Dock',
            type: 'line',
            inputColor: 'ff00fefe',
            lineColor: 'ff7f7f7f'},

            {name: 'PropertyBoundary',
            type: 'line',
            inputColor: 'fffefefe',
            lineColor: 'ff000000'},

            // {name: 'Stairs', // Too many things are red
            // type: 'line',
            // inputColor: 'ff0000fe',
            // lineColor: 'ff0000fe'},

            {name: 'Pond',
            type: 'fill',
            inputColor: 'ff00984b',
            polyColor: 'CCAC774E',
            lineColor: 'ff000000',
            lineWidth: 1},

            {name: 'Building',
            type: 'fill',
            inputColor: 'ff7edefe',
            polyColor: 'CC42A8FD',
            lineColor: 'ff000000',
            lineWidth: 1},

            // {name: 'BuildingOutline', // Building outline is brought in by building fill
            // type: 'polyline',
            // inputColor: 'fffe0000',
            // lineColor: 'ff000000'},
            {name: 'ParkingLot',
            type: 'fill',
            inputColor: 'ff7f7f7f',
            polyColor: 'CC7f7f7f',
            //lineColor: 'ff000000',
            lineWidth: 0}, // Parking lot outline is created by the curbs

            {name: 'ParkingLines',
            type: 'line',
            inputColor: 'ffbfbfbf',
            lineColor: 'ffbfbfbf'},

            {name: 'Letters',
            type: 'ring',
            inputColor: 'ff323232',
            lineColor: 'CC000000',
            drawOrder: 1},
        ]
    };
    // Get xpath search with namespace
    kmlData.namespace = Array.from(oldDom.getElementsByTagName("kml"))[0].namespaceURI
    var selectKmlNs = xpath.useNamespaces({"kmlns": kmlData.namespace});

    // Select the document node
    const documentNode = oldDom.getElementsByTagName("Document")[0];

    // Get all of the folders with data
    const folders = selectKmlNs("kmlns:Folder/kmlns:Folder", documentNode)


    // Get the document name
    kmlData.name = selectKmlNs("//kmlns:Document/kmlns:name", oldDom)[0].firstChild.nodeValue;

    kmlData.elements.forEach((element, elementIndex) => {
        if(element.type == 'line'){
            element.data = folders.filter((f)=> {
                if(selectKmlNs("kmlns:Placemark/kmlns:Style/kmlns:LineStyle/kmlns:color/text()", f)[0] !== undefined){
                    if(selectKmlNs("kmlns:Placemark/kmlns:Style/kmlns:LineStyle/kmlns:color/text()", f)[0].data == element.inputColor){
                        if(selectKmlNs("kmlns:Placemark/kmlns:MultiGeometry/kmlns:LineString", f).length > 0){
                            return true;
                        }
                    }
                }
                else {
                    return false
                }
            }).map((f) => {
                var coordinates = selectKmlNs("kmlns:Placemark/kmlns:MultiGeometry/kmlns:LineString/kmlns:coordinates/text()", f).map((pl) => pl.data.match(/(\S+)/g))
                // var coordinates = polylines.reduce((acc,current,index) => {
                //    return acc.concat(current[1])
                // })
                return {coordinates: coordinates}
            })
        } else if(element.type == 'ring'){
            element.data = folders.filter((f)=> {
                return selectKmlNs("kmlns:Placemark[kmlns:name[contains(text(), '2D Polyline')]]", f).length > 0
            }).map((f) => {
                const lineStrings = selectKmlNs("kmlns:Placemark/kmlns:MultiGeometry/kmlns:LineString/kmlns:coordinates", f);
                var coordinates = lineStrings.map(ls => ls.firstChild.nodeValue.match(/(\S+)/)[0])
                if (coordinates[0] != coordinates[coordinates.length - 1]){
                    console.log(kmlData.name + " Letters were exported as lines not shapes!")
                    throw "Letters were exported as lines not shapes"
                }
                // coordinates = coordinates.map(c => {
                //     var cs = c.split(",")
                //     cs[2] = "2"
                //     return cs.join(",")
                // })
                return {coordinates: coordinates.join(" ")}
            })
        } else if(element.type == 'fill'){
            var fillsData = folders.filter((f)=> {
                if(selectKmlNs("kmlns:Placemark/kmlns:Style/kmlns:PolyStyle/kmlns:color/text()", f)[0] !== undefined){
                    if(selectKmlNs("kmlns:Placemark/kmlns:Style/kmlns:PolyStyle/kmlns:color/text()", f)[0].data == element.inputColor){
                        if(selectKmlNs("kmlns:Placemark/kmlns:MultiGeometry/kmlns:Polygon/kmlns:outerBoundaryIs", f).length > 0){
                            return true;
                        }
                    }
                }
                else {
                    return false
                }
            }).map((f) => {
                var ringCoordinates = selectKmlNs("kmlns:Placemark/kmlns:MultiGeometry/kmlns:Polygon/kmlns:outerBoundaryIs/kmlns:LinearRing/kmlns:coordinates/text()", f)
                        .map(r => {
                            return r.data.match(/(\S+)/g).map(c => {
                                return c.split(',').splice(0,2).map(n => {
                                    return parseFloat(parseFloat(n).toFixed(6))
                                })
                            })
                        })

                var features = ringCoordinates
                    // Convert the coordinates into a GeoJSON polygon
                    .map(rc => turf.polygon([rc])) 
                    // Remove any polygons that have an area of zero because they break the union function
                    .filter(f => turf.area(f) != 0) 
                    // Expand the size of every polygon by an amount less than the precision that google earth renders
                    .map(f => turf.buffer(f, 0.0000001, 'degrees'))


                // Iteratively dissolve polygons until either there is only 1 polygon left or no
                // improvement is made from the last iteration
                
                fs.writeFileSync("_logs/geojson.txt", JSON.stringify(features))
                do{
                    try {
                        var inputFeaturesLength = features.length
                        var featuresBeforeError = features;
                        try{
                            var dissolved = dissolve(turf.featureCollection(features))
                        }
                        catch{
                            // Handles an error in the Turf dissolve function.
                            // If dissolve fails, trim the number of digits after the decimal
                            // Reference: https://github.com/mfogel/polygon-clipping/issues/91#issuecomment-546603188
                            features = features.map(f => {
                                f.geometry.coordinates = f.geometry.coordinates.map(coordinates => {
                                    return coordinates.map(degreeArray => {
                                        return degreeArray.map(degree => {
                                            if(degree.toString().split(".")[1].length || 0 > 6){
                                                return +degree.toFixed(6) //For some reason the plus sign is all you need to convert the string output of toFixed to a number. Javascript is weird.
                                            } else {
                                                return degree
                                            }
                                        })
                                    })
                                })
                                return f
                            })
                            var dissolved = dissolve(turf.featureCollection(features))
                        }
                        features = []
                        for (let i = 0; i < dissolved.features.length; i++) {
                            const element = dissolved.features[i];
                            if(element.geometry.type == 'Polygon'){
                                features.push(turf.polygon(element.geometry.coordinates))
                            }
                            if(element.geometry.type == 'MultiPolygon'){
                                element.geometry.coordinates.forEach(coordinate => {
                                    features.push(turf.polygon(coordinate))
                                });
                            }
                        }
                    } catch (error) {
                        features = featuresBeforeError;
                        console.warn("Error dissolving parcels: " + error)
                        console.log(elementIndex)
                        break;
                    }
                } while (!(features.length == 1) & !(features.length == inputFeaturesLength))

                return {coordinates: features}
                 
            })
            element.data = fillsData;
        }
    })

    return kmlData;
}

function shortenDegrees(f){
    var g = parseFloat(f)
    if(g==0){
        return '0'
    } else {
        return g.toFixed(6)
    }
}

////////////////////
// Create new KMZ //
////////////////////
async function createNewKmz(kmlData){
    const zip = new JSZip();
    // Create new XML document
    const newDom = new DOMParser().parseFromString(`<?xml version="1.0" encoding="UTF-8"?>`)
    const kml = newDom.appendChild(newDom.createElement('kml'))
    kml.setAttribute("xmlns", kmlData.namespace)
    kml.setAttribute("xmlns:gx", "http://www.google.com/kml/ext/2.2")
    // Create Document node for new XML document
    const newDocument = kml.appendChild(newDom.createElement('Document'))
    // Set name
    newDocument.appendChild(newDom.createElement('name')).appendChild(newDom.createTextNode(kmlData.name))
    var listStyle = newDocument.appendChild(newDom.createElement('Style'))
        .appendChild(newDom.createElement('ListStyle'))
    listStyle.appendChild(newDom.createElement('listItemType'))
        .appendChild(newDom.createTextNode('checkHideChildren '))
    var itemIcon = listStyle.appendChild(newDom.createElement('ItemIcon'))
    itemIcon.appendChild(newDom.createElement('state'))
        .appendChild(newDom.createTextNode('open'))
    itemIcon.appendChild(newDom.createElement('href'))
        .appendChild(newDom.createTextNode('https://drive.google.com/uc?export=download&id=15iU5NU2rqEw31EWFEPBo-gHKFqk19JSm'))

    kmlData.elements.forEach(element => {
        if(element.data.length > 0){
            if(element.type == 'line' | element.type == 'polyline'){
                    var styleTemplate = `<Style id="${element.name}">
                    <LineStyle>
                        <color>${element.lineColor}</color>
                        <width>1</width>
                    </LineStyle>
                    </Style>`
                    newDocument.appendChild(new DOMParser().parseFromString(styleTemplate))
                
                    var placemark = newDocument.appendChild(newDom.createElement('Placemark'))
                    placemark.appendChild(newDom.createElement('name')).appendChild(newDom.createTextNode(`${element.name}`))
                    placemark.appendChild(newDom.createElement('styleUrl')).appendChild(newDom.createTextNode(`#${element.name}`))
                    var multiGeometry = placemark.appendChild(newDom.createElement('MultiGeometry'))

                    element.data.forEach((l) => {
                        l.coordinates.forEach(c => {
                            multiGeometry.appendChild(newDom.createElement("LineString"))
                                .appendChild(newDom.createElement('coordinates'))
                                .appendChild(newDom.createTextNode(
                                    c.map(e => e.split(',').map(f => shortenDegrees(f)))
                                ))
                        })
                    })
            } else if (element.type == 'fill'){
                var styleTemplate = `<Style id="${element.name}">
                <PolyStyle>
                    <color>${element.polyColor}</color>
                </PolyStyle>
                <LineStyle>
                    ${element.lineWidth > 0 ? `<color>${element.lineColor}</color><width>${element.lineWidth}</width>` : '<width>0</width>'}
                </LineStyle>
                </Style>`
                newDocument.appendChild(new DOMParser().parseFromString(styleTemplate))
            
                element.data.forEach((d) => {
                    d.coordinates.forEach((r) => {
                        if(r.geometry.type == 'Polygon'){
                            const placemark = newDocument.appendChild(newDom.createElement('Placemark'))
                            placemark.appendChild(newDom.createElement('name')).appendChild(newDom.createTextNode(`${element.name}`))
                            placemark.appendChild(newDom.createElement('styleUrl')).appendChild(newDom.createTextNode(`#${element.name}`))
                            const polygon = placemark.appendChild(newDom.createElement('Polygon'))
                            r.geometry.coordinates.forEach((c,i) => {
                                // According to the GeoJSON Spec: https://geojson.org/geojson-spec.html
                                // For Polygons with multiple rings, the first must be the exterior ring and any others must be interior rings or holes.
                                if(i == 0){
                                    polygon.appendChild(newDom.createElement('outerBoundaryIs'))
                                    .appendChild(newDom.createElement('LinearRing'))
                                    .appendChild(newDom.createElement('coordinates'))
                                    .appendChild(newDom.createTextNode(c.map(a => a.map(b => shortenDegrees(b)).concat([0])).join(' '))) // Switch to newline join for easier reading .join(' \r\n')))
                                } else {
                                    polygon.appendChild(newDom.createElement('innerBoundaryIs'))
                                    .appendChild(newDom.createElement('LinearRing'))
                                    .appendChild(newDom.createElement('coordinates'))
                                    .appendChild(newDom.createTextNode(c.map(a => a.map(b => shortenDegrees(b)).concat([0])).join(' '))) // Switch to newline join for easier reading .join(' \r\n')))
                                }
                            })
                        } 
                    })
                })     
                
            } else if(element.type == 'ring'){
                var styleTemplate = `<Style id="${element.name}">
                <PolyStyle>
                    <color>${element.lineColor}</color>
                </PolyStyle>
                <LineStyle>
                    <width>0</width>
                </LineStyle>
                </Style>`
                newDocument.appendChild(new DOMParser().parseFromString(styleTemplate))

                const placemark = newDocument.appendChild(newDom.createElement('Placemark'))
                placemark.appendChild(newDom.createElement('name')).appendChild(newDom.createTextNode(`${element.name}`))
                placemark.appendChild(newDom.createElement('styleUrl')).appendChild(newDom.createTextNode(`#${element.name}`))
                var multiGeometry = placemark.appendChild(newDom.createElement('MultiGeometry'))
                
                element.data.forEach((r) => {
                    var polygon = multiGeometry.appendChild(newDom.createElement('Polygon'))
                    // polygon.appendChild(newDom.createElement('altitudeMode'))
                    //               .appendChild(newDom.createTextNode('relativeToGround'))
                    polygon.appendChild(newDom.createElement('outerBoundaryIs'))
                    .appendChild(newDom.createElement('LinearRing'))
                    .appendChild(newDom.createElement('coordinates'))
                    .appendChild(newDom.createTextNode(
                        r.coordinates.split(' ')
                            .map(d => d.split(',')
                                .map(f => shortenDegrees(f))
                                .join(',')
                            )
                            .join(' ')
                    ))
                })
                
            }
        }
    })
    // Export KML to string
    const outputString = new XMLSerializer().serializeToString(newDom);

    //  Add output file to KMZ
    const minifiedString = minifyXML(outputString)
    const kmlSize = Math.ceil(minifiedString.length/1024) 
    var zipSize
    zip.file(kmlData.name + ".kml", minifiedString)

    // Write to test kml file
    //fs.writeFileSync("_output/" + kmlData.name + ".kml", format(outputString))
    if (kmlSize >= 10*1024){
        console.warn("KML is 10 MB or larger at "+ kmlSize)
    }
    await zip.generateAsync(
        {type: 'nodebuffer',
         compression: "DEFLATE",
         compressionOptions: {
            level: 9
            }
        }).then(function(content) {
            zipSize = Math.ceil(content.length/1024)
            if (zipSize >= 3*1024){
                throw "KMZ is 3 MB or larger"
            }
            fs.writeFileSync("_output/" + kmlData.name + ".kmz", content)
      }, function(err) {
        console.log(err);
      });
    
    console.info(`KML Written: ${kmlData.name}, KML Size: ${kmlSize} KB, Zip Size: ${zipSize} KB` )
}