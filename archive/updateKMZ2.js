const fs = require('fs')
const JSZip = require('jszip');
const xmldom = require('xmldom')
var xpath = require('xpath');

(async () => {
    // Read the KMZ file
    const file = fs.readFileSync("2820 P-BASE-A4.kmz");

    // Load the KMZ file into JSZip 
    const zip = new JSZip();
    await zip.loadAsync(file)

    // Find the KML file. The KML Documentation specifies only one KML is allowed per KMZ file
    const kmlFileName = Object.keys(zip.files).find(f => f.match(/\.[0-9a-z]+$/i)[0] == '.kml')
    var kmlString = await zip.file(kmlFileName).async("string")

    // Parse the KML string using an XML parser
    const xmlDOM = new DOMParser().parseFromString(kmlString)
    console.log(kmlFile)
})();

async function getName(){

}