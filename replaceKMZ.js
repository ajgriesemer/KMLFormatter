const fs = require('fs');
const JSZip = require('jszip');
const { DOMParser } = require('xmlDom');
const { XMLSerializer } = require('xmlDom');
const parseKML = require('parse-kml');

var dissolve = require('@turf/dissolve');
var xpath = require('xpath');


(async () => {
    var dom = await importKmz("Amazon.kmz");
    var data = await extractKmzData(dom);
    await createNewKmz(data);

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
            console.info('Starting string length: ' + startingStringLength.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + ' bytes')

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
    var kmlData = {
        lines: [
            {name: 'Curbs',
             color: 'ff003efe'},
            {name: '1',
            color: 'fffefe00'},
            {name: 'Grid',
            color: 'ff7f7f7f'}
        ],
        rings: [
            {name: 'Letters',
            color: 'ff323232'}
        ],
        fills: [
            {name: 'Pond',
            color: 'ff00984b'},
            {name: 'Building',
            color: 'ff7edefe'},
            {name: 'Parking',
            color: 'ff7f7f7f'}
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

    kmlData.lines.forEach((line) => {
        line.data = folders.filter((f)=> {
            if(selectKmlNs("kmlns:Placemark/kmlns:Style/kmlns:LineStyle/kmlns:color/text()", f)[0] !== undefined){
                if(selectKmlNs("kmlns:Placemark/kmlns:Style/kmlns:LineStyle/kmlns:color/text()", f)[0].data == line.color){
                    if(selectKmlNs("kmlns:Placemark/kmlns:MultiGeometry/kmlns:LineString", f).length > 0){
                        return true;
                    }
                }
            }
            else {
                return false
            }
        }).map((f) => {
            return {coordinates: selectKmlNs("kmlns:Placemark/kmlns:MultiGeometry/kmlns:LineString/kmlns:coordinates/text()", f)[0].data}
        })
    })
    kmlData.rings.forEach((ring) => {
        ring.data = folders.filter((f)=> {
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
    })
    kmlData.fills.forEach((fill) => {
        var fillsData = folders.filter((f)=> {
            if(selectKmlNs("kmlns:Placemark/kmlns:Style/kmlns:PolyStyle/kmlns:color/text()", f)[0] !== undefined){
                if(selectKmlNs("kmlns:Placemark/kmlns:Style/kmlns:PolyStyle/kmlns:color/text()", f)[0].data == fill.color){
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
                    .map(r => r.data.match(/(\S+)/g))
            return {coordinates: ringCoordinates}
        })
        fill.data = fillsData[0];
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

    kmlData.lines.forEach(line => {
        var styleTemplate = `<Style id="${line.name}">
          <LineStyle>
            <color>${line.color}</color>
            <width>1</width>
          </LineStyle>
        </Style>`
        newDocument.appendChild(new DOMParser().parseFromString(styleTemplate))
    
        var placemark = newDocument.appendChild(newDom.createElement('Placemark'))
        placemark.appendChild(newDom.createElement('name')).appendChild(newDom.createTextNode(`${line.name}`))
        placemark.appendChild(newDom.createElement('styleUrl')).appendChild(newDom.createTextNode(`#${line.name}`))
        var multiGeometry = placemark.appendChild(newDom.createElement('MultiGeometry'))
    
        line.data.forEach((l) => {
            multiGeometry.appendChild(newDom.createElement("LineString"))
                  .appendChild(newDom.createElement('coordinates'))
                  .appendChild(newDom.createTextNode(l.coordinates))
        })
    })
    kmlData.rings.forEach(ring => {
        var styleTemplate = `<Style id="${ring.name}">
          <PolyStyle>
            <color>${ring.color}</color>
          </PolyStyle>
          <LineStyle>
            <width>0</width>
          </LineStyle>
        </Style>`
        newDocument.appendChild(new DOMParser().parseFromString(styleTemplate))
    
        const placemark = newDocument.appendChild(newDom.createElement('Placemark'))
        placemark.appendChild(newDom.createElement('name')).appendChild(newDom.createTextNode(`${ring.name}`))
        placemark.appendChild(newDom.createElement('styleUrl')).appendChild(newDom.createTextNode(`#${ring.name}`))
        var multiGeometry = placemark.appendChild(newDom.createElement('MultiGeometry'))
        
        ring.data.forEach((r) => {
            multiGeometry.appendChild(newDom.createElement('Polygon'))
            .appendChild(newDom.createElement('outerBoundaryIs'))
            .appendChild(newDom.createElement('LinearRing'))
            .appendChild(newDom.createElement('coordinates'))
            .appendChild(newDom.createTextNode(r.coordinates))
        })
    })
    kmlData.fills.forEach(fill => {
        var styleTemplate = `<Style id="${fill.name}">
          <PolyStyle>
            <color>${fill.color}</color>
          </PolyStyle>
        </Style>`
        newDocument.appendChild(new DOMParser().parseFromString(styleTemplate))
    
        const placemark = newDocument.appendChild(newDom.createElement('Placemark'))
        placemark.appendChild(newDom.createElement('name')).appendChild(newDom.createTextNode(`${fill.name}`))
        placemark.appendChild(newDom.createElement('styleUrl')).appendChild(newDom.createTextNode(`#${fill.name}`))
        var multiGeometry = placemark.appendChild(newDom.createElement('MultiGeometry'))
        
        fill.data.coordinates.forEach((r) => {
            multiGeometry.appendChild(newDom.createElement('Polygon'))
            .appendChild(newDom.createElement('outerBoundaryIs'))
            .appendChild(newDom.createElement('LinearRing'))
            .appendChild(newDom.createElement('coordinates'))
            .appendChild(newDom.createTextNode(r.join(' ')))
        })
    })
    // Export KML to string
    const outputString = new XMLSerializer().serializeToString(newDom);
    // Replace KML file in Zip file with edited file
    zip.file(kmlData.name + ".kml", outputString)

    // Write to test kml file
    fs.writeFileSync(kmlData.name + ".kml", outputString)
    
    zip.generateAsync({type: 'nodebuffer'}).then(function(content) {
        fs.writeFileSync(kmlData.name + " test.kmz", content)
      }, function(err) {
        console.log(err);
      });
}