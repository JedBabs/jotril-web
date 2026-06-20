const cp = require("child_process");
const fs = require('fs');

["Jotril-Space-1", "Jotril-Space-2"].forEach(space => {
    let app = fs.readFileSync(space + "/app.py", "utf8");
    app = app.replace("batch_input = gr.JSON()", "batch_input = gr.State()");
    app = app.replace("batch_output = gr.JSON()", "batch_output = gr.State()");
    fs.writeFileSync(space + "/app.py", app);
    
    cp.execSync("git add app.py && git commit -m \"Fix Pydantic validation by using gr.State instead of gr.JSON\" && git push origin main", { cwd: space, env: process.env, stdio: "inherit" });
});
console.log("Spaces patched successfully");
