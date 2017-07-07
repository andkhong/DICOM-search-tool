'use strict'; 

const dwv = require('dwv');
const { readdir, readFile, stat, unlink } = require('fs');
const { join, extname } = require('path');
const { promisify } = require('util');

const readDirAsync = promisify(readdir);
const readFileAsync = promisify(readFile);
const readStatAsync = promisify(stat);
const unlinkAsync = promisify(unlink);

async function deletePath(dir){
    try {
        unlinkAsync(dir);
        console.log("Successful in removing file path", dir);
    } catch(e){
        console.log("Unsuccessful in deleting content", dir);
    }
}

// resolves with the file names within the given directory
async function getDirContents (dir) {
    try {
        return await readDirAsync(dir);
    } catch(e) {
        deletePath(dir);
    }
};

// resolves with an object containing the type ('file' or 'dir') for the given file path and the file path itself: { filePath, type }
function getPathAndType(filePath){
    return readStatAsync(filePath)
        .then(stat => {
            if (!stat.isDirectory() && !stat.isFile()) return reject('Not file or directory! Invalid Path:', filePath);
            const type = stat.isDirectory() ? 'dir' : 'file';
            return { filePath, type };
        });
};

// resolves with a boolean representing if DICOM file matches search content
function readDICOMtag(filePath, age, gender){ // array[Age, Gender];
    return readFileAsync(filePath)
        .then(data => {
            let arrayBuffer = new Uint8Array(data).buffer;
            let dicomParser = new dwv.dicom.DicomParser();
            dicomParser.parse(arrayBuffer);
            let tags = dicomParser.getDicomElements();
            let patientAge = parseAge(tags.getFromName('PatientAge'));
            let patientGender = tags.getFromName('PatientSex')[0];
            return patientAge === age && patientGender === gender;
        })
        .catch(e => deletePath(filePath)); // Delete Non DICOM files from dir
}
// Function listed above can be swapped for another DICOM parsing library

function parseAge(string){
    let sub = parseInt(string.substring(0, 3));
    switch(string[3]){
        case 'Y': // Years
            return sub;
        case 'M': // Months
            return sub/12;
        case 'W': // Weeks
            return sub/52;
        case 'D': // Days
            return sub/356;
    }
}

function getDICOMfiles(dir, age, gender){
    const output = [];
    return getDirContents(dir)
        .then(names => names.filter(content => !content.startsWith('.'))) // Filter hidden folders
        .then(names => names.map(content => getPathAndType(join(dir, content))))
        .then((pathsAndTypesPromises) =>
            Promise.all(pathsAndTypesPromises.map(promise =>
                promise.then(({ filePath, type }) => {
                    if (type === 'dir') {
                        return getDICOMfiles(filePath, age, gender)
                            .then(recursiveOutput => {
                                if (recursiveOutput.length > 0) {
                                    output.push(recursiveOutput);
                                }
                            })
                    } else {
                        return readDICOMtag(filePath, age, gender)
                            .then(valid => {
                                if (valid) {
                                    output.push(filePath);
                                }
                            });
                    };
                })
            ))
        )
        .then(() =>  flatten(output))
        .catch(e => console.log("Not a directory", dir));
};

function flatten(arr) {
    return arr.reduce((flat, toFlatten) => {
        return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
    }, []);
};

module.exports = getDICOMfiles;