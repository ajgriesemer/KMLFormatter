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

(async () => {
    var files = fs.readdirSync("_input")
    for (let i = 0; i < files.length; i++) { //
        var dom = await importKmz("_input/" + files[i]);
        var data = await extractKmzData(dom);
        await createNewKmz(data);
    }
  })();

// Takes in a path to a file, returns the KML file to edit as a DOM object
async function importKmz(path){
    // Read the KMZ file
    const file = fs.readFileSync(path);

    const zip = new JSZip();
    // Load the KMZ file into JSZip 
    await zip.loadAsync(file)

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
            var textNodes = xpath.select("//text()", oldDom)
            textNodes = textNodes.filter((tn) => {return !/\S/.test(tn.data)}).forEach((tn) => {tn.parentNode.removeChild(tn)})
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
            lineWidth: 0},

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

    kmlData.elements.forEach((element) => {
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
                var coords = "", first;
                lineStrings.forEach((ls,i) => {
                    const coordinate = ls.firstChild.nodeValue.match(/(\S+)/)[0]
                    coords += coordinate + " "
                    if(i == 0){
                        first = coordinate
                    }
                })
                coords += first 
                return {coordinates: coords}
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

                // Skip the dissolve step on the parking lots until it starts working better
                if(element.name != 'ParkingLot'){
                    // Iteratively dissolve polygons until either there is only 1 polygon left or no
                    // improvement is made from the last iteration
                    do{
                        var inputFeaturesLength = features.length
                        var dissolved = dissolve(turf.featureCollection(features))
                        features = []
                        for (let i = 0; i < dissolved.features.length; i++) {
                            const element = dissolved.features[i];
                            if(element.geometry.type == 'Polygon'){
                                features.push(turf.polygon([element.geometry.coordinates[0]]))
                            }
                            
                            if(element.geometry.type == 'MultiPolygon'){
                                element.geometry.coordinates.forEach(c => {
                                    features.push(turf.polygon([c[0]]))
                                })
                            }
                        }
                    } while (!(features.length == 1) & !(features.length == inputFeaturesLength))
                    console.log(element.name + " " + features.length)
                }
                return {coordinates: features}
                 
            })
            element.data = fillsData;
        }
    })

    return kmlData;
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
    // Create Document node for new XML document
    const newDocument = kml.appendChild(newDom.createElement('Document'))
    // Set name
    newDocument.appendChild(newDom.createElement('name')).appendChild(newDom.createTextNode(kmlData.name))
    var listStyle = newDocument.appendChild(newDom.createElement('Style'))
        .appendChild(newDom.createElement('ListStyle'))
    // listStyle.appendChild(newDom.createElement('listItemType'))
    //     .appendChild(newDom.createTextNode('checkHideChildren '))
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
                                .appendChild(newDom.createTextNode(c))
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
            
                // if(element.name == 'Pond'){
                //     element.data.forEach((d) => {
                //         d.coordinates.forEach((r) => {
                //             if(r.geometry.type == 'Polygon'){
                //                 r.geometry.coordinates.forEach((c) => {
                //                     const placemark = newDocument.appendChild(newDom.createElement('Placemark'))
                //                     placemark.appendChild(newDom.createElement('name')).appendChild(newDom.createTextNode(`${element.name}`))
                //                     placemark.appendChild(newDom.createElement('styleUrl')).appendChild(newDom.createTextNode(`#${element.name}`))

                //                     placemark.appendChild(newDom.createElement('Polygon'))
                //                     .appendChild(newDom.createElement('outerBoundaryIs'))
                //                     .appendChild(newDom.createElement('LinearRing'))
                //                     .appendChild(newDom.createElement('coordinates'))
                //                     .appendChild(newDom.createTextNode(c.map(a => a.concat([0])).join(' \r\n')))
                //                 })
                //             } else if(r.geometry.type == 'MultiPolygon'){
                //                 r.geometry.coordinates.forEach((c) => {
                                    
                //                     const placemark = newDocument.appendChild(newDom.createElement('Placemark'))
                //                     placemark.appendChild(newDom.createElement('name')).appendChild(newDom.createTextNode(`${element.name}`))
                //                     placemark.appendChild(newDom.createElement('styleUrl')).appendChild(newDom.createTextNode(`#${element.name}`))
                //                     placemark.appendChild(newDom.createElement('Polygon'))
                //                     .appendChild(newDom.createElement('outerBoundaryIs'))
                //                     .appendChild(newDom.createElement('LinearRing'))
                //                     .appendChild(newDom.createElement('coordinates'))
                //                     .appendChild(newDom.createTextNode(c[0].map(a => a.concat([0])).join(' \r\n')))
                //                 })
                //             }
                //         })
                //     })      
                // } else {

                const placemark = newDocument.appendChild(newDom.createElement('Placemark'))
                placemark.appendChild(newDom.createElement('name')).appendChild(newDom.createTextNode(`${element.name}`))
                placemark.appendChild(newDom.createElement('styleUrl')).appendChild(newDom.createTextNode(`#${element.name}`))
                var multiGeometry = placemark.appendChild(newDom.createElement('MultiGeometry'))
                
                element.data.forEach((d) => {
                    d.coordinates.forEach((r) => {
                        if(r.geometry.type == 'Polygon'){
                            r.geometry.coordinates.forEach((c) => {
                                multiGeometry.appendChild(newDom.createElement('Polygon'))
                                .appendChild(newDom.createElement('outerBoundaryIs'))
                                .appendChild(newDom.createElement('LinearRing'))
                                .appendChild(newDom.createElement('coordinates'))
                                .appendChild(newDom.createTextNode(c.map(a => a.concat([0])).join(' \r\n')))
                            })
                        } else if(r.geometry.type == 'MultiPolygon'){
                            r.geometry.coordinates.forEach((c) => {
                                multiGeometry.appendChild(newDom.createElement('Polygon'))
                                .appendChild(newDom.createElement('outerBoundaryIs'))
                                .appendChild(newDom.createElement('LinearRing'))
                                .appendChild(newDom.createElement('coordinates'))
                                .appendChild(newDom.createTextNode(c[0].map(a => a.concat([0])).join(' \r\n')))
                            })
                        }
                    })
                })     
                
                // fill.data.coordinates.forEach((r) => {
                //     multiGeometry.appendChild(newDom.createElement('Polygon'))
                //     .appendChild(newDom.createElement('outerBoundaryIs'))
                //     .appendChild(newDom.createElement('LinearRing'))
                //     .appendChild(newDom.createElement('coordinates'))
                //     .appendChild(newDom.createTextNode(r.join(' ')))
                // })
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
                    multiGeometry.appendChild(newDom.createElement('Polygon'))
                    .appendChild(newDom.createElement('outerBoundaryIs'))
                    .appendChild(newDom.createElement('LinearRing'))
                    .appendChild(newDom.createElement('coordinates'))
                    .appendChild(newDom.createTextNode(r.coordinates))
                })
                
            }
        }
    })
    // Export KML to string
    const outputString = new XMLSerializer().serializeToString(newDom);
    // Replace KML file in Zip file with edited file
    zip.file("_output/" + kmlData.name + ".kml", outputString)

    // Write to test kml file
    fs.writeFileSync("_output/" + kmlData.name + ".kml", format(outputString))
    console.info('KML Written: ' + kmlData.name)


    // zip.generateAsync({type: 'nodebuffer'}).then(function(content) {
    //     fs.writeFileSync("_output/" + kmlData.name + " test.kmz", content)
    //   }, function(err) {
    //     console.log(err);
    //   });
}