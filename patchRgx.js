const fs = require('fs');
let code = fs.readFileSync('src/lib/jotrilService.js', 'utf8');

code = code.replace(/const finalMatch[\s\S]+return resultData\[0\];[\s\S]+}/m, 
               if (streamData.includes("event: complete")) {
                   const splitData = streamData.split("event: complete");
                   const dataBlock = splitData[splitData.length - 1];
                   if (dataBlock.includes("data:")) {
                       const jsonStr = dataBlock.substring(dataBlock.indexOf("data:") + 5).trim();
                       try {
                           const resultData = JSON.parse(jsonStr);
                           return resultData[0]; // Assuming Gradio returns 2D array [[results]]
                       } catch(err) {
                           console.log("JSON Parse Error on stream:", jsonStr);
                       }
                   }
               });

fs.writeFileSync('src/lib/jotrilService.js', code);
console.log("Regex patched natively");
