const fs = require('fs');
let code = fs.readFileSync('src/lib/jotrilService.js', 'utf8');

const tTarget = `const finalMatch = streamData.match(/event: complete\\n*data: (.+)/);\n               if (finalMatch) { \n                   const resultData = JSON.parse(finalMatch[1]);\n                   return resultData[0]; // Assuming Gradio returns 2D array [[results]]\n               }`;

const tReplace = `if (streamData.includes("event: complete")) {
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
               }`;

code = code.replace(tTarget, tReplace);
fs.writeFileSync('src/lib/jotrilService.js', code);
console.log("Regex patched natively");
