const fs = require('fs')
const JSZip = require('jszip');
const { DOMParser } = require('xmldom')
const { XMLSerializer } = require('xmldom')
const parseKML = require('parse-kml');

var xpath = require('xpath');
const xmldom = require('xmldom');

const zip = new JSZip();
(async () => {
    // Read the KMZ file
    const file = fs.readFileSync("2820 P-BASE-A4.kmz");

    // Load the KMZ file into JSZip 
    await zip.loadAsync(file)

    // For each file in the unzipped KMZ
    for (let i = 0; i < Object.keys(zip.files).length; i++) {
        // If the file is a kml file (there should only be one)
        if(Object.keys(zip.files)[i].match(/\.[0-9a-z]+$/i)[0] == '.kml'){
            // Convert the file to a string
            var document = await zip.file(Object.keys(zip.files)[i]).async("string")
            const startingStringLength = document.length
            console.info('Starting string length: ' + startingStringLength.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + ' bytes')
            // Parse the KML string using an XML parser
            const xmlDOM = new DOMParser().parseFromString(document)

            // Select the document node
            const documentNode = xmlDOM.getElementsByTagName("Document")[0];

            // Get xpath search with namespace
            var namespace = Array.from(xmlDOM.getElementsByTagName("kml"))[0].namespaceURI
            var selectKmlNs = xpath.useNamespaces({"kmlns": namespace});
            
            // Remove the LookAt node. This node causes the view to initialize to looking at the whole globe
            documentNode.removeChild(documentNode.getElementsByTagName("LookAt")[0])

            // Remove folders that do not have name = Model
            selectKmlNs("//kmlns:Document/kmlns:Folder", xmlDOM).forEach((n) => {
                if(!selectKmlNs("kmlns:name = 'Model'", n)){
                    documentNode.removeChild(n)
                }
            })

            // Move the contents of the folder where name = Model to the Document and delete the folder
            var modelFolder = selectKmlNs("//kmlns:Document/kmlns:Folder[kmlns:name = 'Model']", xmlDOM)[0];
            Array.from(modelFolder.childNodes).forEach((cn) => {
                if(cn.nodeName != 'name' && cn.nodeName != 'open')
                {
                    documentNode.appendChild(cn);
                }
            })
            documentNode.removeChild(modelFolder)

            const step1Length = new XMLSerializer().serializeToString(xmlDOM).length
            console.info('1. Extra Content Remove. Size reduced by: ' + (startingStringLength - step1Length).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + ' bytes')

            //
            const allElements = Array.from(documentNode.childNodes).filter(cn => cn.nodeName != '#text')
            const allStyles = [];
            allElements.forEach(e => {
                var style = selectKmlNs(".//kmlns:Style", e)
                var allStyle = {styles: []}
                if(style.length > 0){
                    allStyle.name = selectKmlNs("./kmlns:name", e)[0].firstChild.nodeValue.slice(0, -7)
                    var lineStyle = selectKmlNs("./kmlns:LineStyle", style[0])
                    if(lineStyle.length > 0){
                        allStyle.styles.push({
                            type: 'LineStyle',
                            color: selectKmlNs("./kmlns:color", lineStyle[0])[0].firstChild.nodeValue,
                            width: selectKmlNs("./kmlns:width", lineStyle[0])[0].firstChild.nodeValue
                        })
                    }
                    var polyStyle = selectKmlNs("./kmlns:PolyStyle", style[0])
                    if(polyStyle.length > 0){
                        allStyle.styles.push({
                            type: 'PolyStyle',
                            color: selectKmlNs("./kmlns:color", polyStyle[0])[0].firstChild.nodeValue,
                            outline: selectKmlNs("./kmlns:outline", polyStyle[0])[0].firstChild.nodeValue
                        })
                    }
                }
            })
            var polylines = selectKmlNs("//kmlns:Document/kmlns:Folder/kmlns:Placemark[kmlns:name[contains(text(), '2D Polyline')]]", xmlDOM);
            polylines.forEach((pl)=> {
                const style = selectKmlNs("kmlns:Style", pl)[0];
                const lineColor = selectKmlNs("kmlns:LineStyle/kmlns:color", style)[0].firstChild.nodeValue.substring(2).match(/.{1,2}/g).reverse().join('')
                console.log("%cWhatever you want to say", "background-color: #" + lineColor + "; color: white")

                const newStyle = xmlDOM.createElement('Style')
                newStyle.appendChild(xmlDOM.createElement('LineStyle'))
                    .appendChild(xmlDOM.createElement('color'))
                    .appendChild(xmlDOM.createTextNode('ff00fefe'))
                    newStyle.appendChild(xmlDOM.createElement('PolyStyle'))
                        .appendChild(xmlDOM.createElement('color'))
                        .appendChild(xmlDOM.createTextNode('ff00fefe'))
                style.parentNode.replaceChild(placemarkNode, style)

                const placemarkNode = xmlDOM.createElement('Placemark')
                placemarkNode.appendChild(style)
                const coordinatesNode = placemarkNode.appendChild(xmlDOM.createElement('Polygon'))
                .appendChild(xmlDOM.createElement('outerBoundaryIs'))
                .appendChild(xmlDOM.createElement('LinearRing'))
                .appendChild(xmlDOM.createElement('coordinates'))
                const lineStrings = selectKmlNs("kmlns:MultiGeometry/kmlns:LineString/kmlns:coordinates", pl);

                var coordinates = "", first;
                lineStrings.forEach((ls,i) => {
                    const firstCoordinate = ls.firstChild.nodeValue.match(/(\S+)/)[0]
                    coordinates += firstCoordinate + " "
                    if(i == 0){
                        first = firstCoordinate
                    }
                })
                coordinates += first 

                coordinatesNode.appendChild(xmlDOM.createTextNode(coordinates))
                const folderNode = pl.parentNode
                folderNode.parentNode.replaceChild(placemarkNode, folderNode)
                    
            })
            

            const step2Length = new XMLSerializer().serializeToString(xmlDOM).length
            console.info('2. Replaced Polylines with Polygons. Size reduced by: ' + (step1Length - step2Length).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + ' bytes')

            // Export KML to string
            //console.log( new XMLSerializer().serializeToString(xmlDOM))
            const outputString = new XMLSerializer().serializeToString(xmlDOM);

            // Replace KML file in Zip file with edited file
            zip[zip.files[i]] = outputString

            // Write to test kml file
            fs.writeFileSync("2820 P-BASE-A4 edited.kml", outputString)
        }
    }
    
    zip.generateAsync({type: 'nodebuffer'}).then(function(content) {
        fs.writeFileSync("2820 P-BASE-A4 edited.kmz", content)
      }, function(err) {
        console.log(err);
      });
  })();