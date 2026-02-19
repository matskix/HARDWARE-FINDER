
// === SQL.js DB setup ===
let db, SQL;
const locFile = file => `https://unpkg.com/sql.js@1.8.0/dist/${file}`;
initSqlJs({ locateFile: locFile }).then(SQLlib => {
  
  SQL = SQLlib;
  const saved = localStorage.getItem("hardwareDB_v1");
  if (saved) { db = new SQL.Database(Uint8Array.from(JSON.parse(saved))); }
  else { db = new SQL.Database(); db.run(`CREATE TABLE IF NOT EXISTS hardware (id INTEGER PRIMARY KEY AUTOINCREMENT, part_number TEXT NOT NULL, description TEXT, location TEXT NOT NULL, quantity INTEGER DEFAULT 100);`); saveToLocal(); }
}).catch(err => alert("Failed to load sql.js. Use a local server."));

function saveToLocal() { try { localStorage.setItem("hardwareDB_v1", JSON.stringify(Array.from(db.export()))); } catch(e){ console.error(e); } }
function onSubmitForm() { 
  const id = document.getElementById("editId").value; 
  const pn = document.getElementById("partNumber").value.trim(); 
  const desc = document.getElementById("description").value.trim(); 
  const loc = document.getElementById("location").value.trim(); 
  const qty = parseInt(document.getElementById("quantity").value||"100",10); 
  if(!pn||!loc){alert("Part Number and Location required");return;} 
  if(id) db.run("UPDATE hardware SET part_number=?,description=?,location=?,quantity=? WHERE id=?",[pn,desc,loc,qty,id]); 
  else db.run("INSERT INTO hardware (part_number,description,location,quantity) VALUES (?,?,?,?)",[pn,desc,loc,qty]); 
  resetForm(); saveToLocal(); searchHardware(); 
}
function resetForm(){ 
  document.getElementById("hwForm").reset(); 
  document.getElementById("editId").value=""; 
  document.getElementById("quantity").value=100; 
  document.getElementById("formTitle").innerText="Add Hardware"; 
}

// === SEARCH FUNCTION ===
let showActionButtons = localStorage.getItem("showActionButtons") === "true"; // load saved state

///START HERE 

function searchHardware(){ 
   const rawQ = document.getElementById("search").value.trim().toLowerCase();
   const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/gi,"");

   const tbody = document.getElementById("results"); 
   const noResults = document.getElementById("noResults"); 
   const tableWrap = document.getElementById("tableWrap"); 
   tbody.innerHTML = ""; 
   noResults.style.display = "none"; 
   tableWrap.style.display = "none";

  if(!rawQ){ return; } // hide table when search empty

  const terms = rawQ.split(/\s+/).map(normalize).filter(t => t.length > 0); // split by spaces
  if(terms.length === 0) return;

  const stmt = db.prepare("SELECT * FROM hardware ORDER BY part_number ASC"); 
  let found = false, index = 0; 

  while(stmt.step()){ 
     const r = stmt.getAsObject(); 
     const pn = normalize(r.part_number);
     const desc = normalize(r.description || "");
     const loc = normalize(r.location);

    // Check if ALL search terms exist in ANY of the fields
    const matches = terms.every(term => 
       pn.includes(term) || desc.includes(term) || loc.includes(term)
    );

    if(matches){ 
       found = true; 
       const tr = document.createElement("tr"); 
       tr.classList.add("results-row"); 
       tr.style.animationDelay = `${index*0.1}s`; 

       const highlightTerm = term => new RegExp(term.split("").join("[^a-z0-9]*"), "gi");

       const safePN = escapeHtml(r.part_number).replace(
         new RegExp(terms.map(t=>t.split("").join("[^a-z0-9]*")).join("|"), "gi"), 
         match => `<mark><b>${match}</b></mark>`
      );
      const safeDesc = escapeHtml(r.description||"").replace(
         new RegExp(terms.map(t=>t.split("").join("[^a-z0-9]*")).join("|"), "gi"), 
         match => `<mark><b>${match}</b></mark>`
      );
      const safeLoc = escapeHtml(r.location).replace(
         new RegExp(terms.map(t=>t.split("").join("[^a-z0-9]*")).join("|"), "gi"), 
         match => `<mark><b>${match}</b></mark>`
      );

      const displayQty = r.quantity===0
        ? "<span style='color:red;font-weight:bold;'>Out of stock</span>"
        : r.quantity; 

      tr.innerHTML = `
         <td>${safePN}</td>
         <td>${safeDesc}</td>
         <td>${safeLoc}</td>
         <td>${displayQty}</td>
         <td>
          <div class="action-btns">
             <button onclick="onEdit(${r.id})" aria-label="Edit ${escapeHtml(r.part_number)}">Edit</button>
             <button onclick="onDelete(${r.id})" aria-label="Delete ${escapeHtml(r.part_number)}">Delete</button>
          </div>
        </td>`; 

      tbody.appendChild(tr); 
      index++; 
    } 
  } 
  stmt.free(); 
  if(found) tableWrap.style.display = "block"; 
  else noResults.style.display = "block"; 

  applyActionButtonsState(showActionButtons);
}



////END HERE 

////_import new

function importCSV(ev) {
  const file = ev.target.files[0];
  if (!file) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      const rows = results.data;

      if (rows.length === 0) {
        alert("CSV has no data");
        return;
      }

      let imported = 0;
      const skipped = [];

      try {
        db.run("BEGIN TRANSACTION");

        rows.forEach((row, index) => {
          const pn = row.part_number ? row.part_number.trim() : "";
          const desc = row.description ? row.description.trim() : "";
          const loc = row.location ? row.location.trim() : "";
          const qty = row.quantity && row.quantity !== "" ? parseInt(row.quantity, 10) : 100;

          if (!pn || !loc) {
            skipped.push(`Row ${index + 2}: Missing part_number or location`);
            return;
          }

          // check for duplicate part_number
          const check = db.prepare("SELECT id FROM hardware WHERE part_number = ?");
          check.bind([pn]);

          if (check.step()) {
            skipped.push(`Row ${index + 2}: Duplicate part_number "${pn}"`);
            check.free();
            return;
          }
          check.free();

          db.run(
            "INSERT INTO hardware (part_number, description, location, quantity) VALUES (?,?,?,?)",
            [pn, desc, loc, qty]
          );

          imported++;
        });

        db.run("COMMIT");

        saveToLocal();
        searchHardware();

        let msg = `CSV import complete.\n${imported} rows added.`;
        if (skipped.length > 0) {
          msg += `\n${skipped.length} rows skipped:\n` + skipped.join("\n");
        }

        alert(msg);

      } catch (err) {
        db.run("ROLLBACK");
        console.error("CSV import error:", err);
        alert("Something went wrong: " + err.message);
      }
    }
  });
}


      
////_import 


    


// === EDIT / DELETE FUNCTIONS ===
function onEdit(id){ 
  const stmt=db.prepare("SELECT * FROM hardware WHERE id=?"); 
  stmt.bind([id]); 
  if(stmt.step()){ 
    const r=stmt.getAsObject(); 
    document.getElementById("editId").value=r.id; 
    document.getElementById("partNumber").value=r.part_number; 
    document.getElementById("description").value=r.description||""; 
    document.getElementById("location").value=r.location; 
    document.getElementById("quantity").value=r.quantity||100; 
    document.getElementById("formTitle").innerText="Edit Hardware"; 

    // Ensure the add/edit form is visible when editing
    toggleActionButtons(true);
    // scroll form into view on small screens
    const formCard = document.getElementById("addHardwareCard");
    if(formCard) formCard.scrollIntoView({behavior: "smooth", block: "center"});
  } 
  stmt.free(); 
}
function onDelete(id){ if(!confirm("Delete this item?")) return; db.run("DELETE FROM hardware WHERE id=?",[id]); saveToLocal(); searchHardware(); }
function saveDatabase(){ const data=db.export(); const blob=new Blob([data],{type:'application/octet-stream'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='hardware.db'; a.click(); }
function loadDatabase(ev){ const f=ev.target.files&&ev.target.files[0]; if(!f) return; const reader=new FileReader(); reader.onload=function(e){ db=new SQL.Database(new Uint8Array(e.target.result)); saveToLocal(); searchHardware(); alert("Database loaded."); }; reader.readAsArrayBuffer(f); }
function exportCSV(){ const res=db.exec("SELECT part_number, description, location, quantity FROM hardware ORDER BY part_number"); if(!res||!res[0]){alert("No data to export");return;} const cols=res[0].columns; const rows=res[0].values; let csv=cols.join(",")+"\n"+rows.map(r=>r.map(c=>quoteCsv(String(c))).join(",")).join("\n"); const blob=new Blob([csv],{type:"text/csv"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="hardware.csv"; a.click(); }
function quoteCsv(s){return '"'+s.replace(/"/g,'""')+'"';}
function escapeHtml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function clearLocal(){ if(!confirm("Clear local saved DB? This will remove all data from localStorage.")) return; localStorage.removeItem("hardwareDB_v1"); db=new SQL.Database(); db.run(`CREATE TABLE IF NOT EXISTS hardware (id INTEGER PRIMARY KEY AUTOINCREMENT, part_number TEXT NOT NULL, description TEXT, location TEXT NOT NULL, quantity INTEGER DEFAULT 100);`); saveToLocal(); searchHardware(); alert("Local DB cleared.");}

/* Logo upload / persistence */
function uploadLogo(ev){ const f = ev.target.files && ev.target.files[0]; if(!f) return; const reader = new FileReader(); reader.onload = function(e){ const dataUrl = e.target.result; const img = document.getElementById("logoImg"); img.src = dataUrl; try { localStorage.setItem("hardwareLogo", dataUrl); } catch(err){ console.error(err); } }; reader.readAsDataURL(f); }
const savedLogo = localStorage.getItem("hardwareLogo");
if(savedLogo) document.getElementById("logoImg").src = savedLogo;

/* Header title persistence */
const headerInput=document.getElementById("headerTitle");
const savedHeader=localStorage.getItem("hardwareHeader");
if(savedHeader) headerInput.value=savedHeader;
headerInput.addEventListener("input",()=>{localStorage.setItem("hardwareHeader",headerInput.value);});
headerInput.addEventListener("keypress",(e)=>{if(e.key==="Enter") headerInput.blur();});


/* Background image */
const savedBgImage = localStorage.getItem("hardwareBgImage");
if(savedBgImage) setBackground(savedBgImage);

document.getElementById("bgUpload").addEventListener("change", (e)=>{
  const file = e.target.files[0];
  if(!file) return;

  // ✅ Limit to 2MB
  if(file.size > 2 * 1024 * 1024) { 
    alert("Background image must be less than 2MB.");
    e.target.value = ""; // reset file input
    return;
  }

  const reader = new FileReader();
  reader.onload = function(ev){
    const dataUrl = ev.target.result;
    setBackground(dataUrl);
    try { 
      localStorage.setItem("hardwareBgImage", dataUrl); 
    } catch(err){ 
      console.error("LocalStorage quota exceeded", err); 
    }
  };
  reader.readAsDataURL(file);
});

function setBackground(img){
  document.body.style.backgroundImage = `url(${img})`;
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundRepeat = "no-repeat";
  document.body.style.backgroundPosition = "center center";
  document.body.style.backgroundAttachment = "fixed";
}



//start



//end of the background Image 

function toggleFullscreen() {
  if (!document.fullscreenElement) { document.documentElement.requestFullscreen().catch(err => { alert(`Error attempting fullscreen: ${err.message} (${err.name})`); }); } 
  else { document.exitFullscreen(); }
}



// === ACTION BUTTONS & ADD FORM TOGGLE (CTRL+ALT+E + Mobile Button) ===
document.addEventListener("DOMContentLoaded", () => {

  // Persistent state variable
  let showActionButtons = localStorage.getItem("showActionButtons") === "true";

  // Apply CSS class based on state
  function applyActionButtonsState(show) {
    document.body.classList.toggle("show-actions", !!show);
  }

  // Toggle function
  function toggleActionButtons(show) {
    showActionButtons = !!show;
    applyActionButtonsState(showActionButtons);
    localStorage.setItem("showActionButtons", showActionButtons);
  }

  // Initialize visible state
  applyActionButtonsState(showActionButtons);

  // --- Keyboard shortcut: CTRL + ALT + E ---
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      toggleActionButtons(!showActionButtons);
    }
  });

  // --- Mobile button click ---
  const mobileActionBtn = document.getElementById("mobileActionBtn");
  if (mobileActionBtn) {
    mobileActionBtn.addEventListener("click", () => {
      toggleActionButtons(!showActionButtons);
    });
  }

});






// === Dark / Light mode toggle ===
const themeToggle = document.getElementById("themeToggle");

// Load saved theme
let savedTheme = localStorage.getItem("hardwareTheme") || "light";
if(savedTheme === "dark") {
  document.body.classList.add("dark");
  themeToggle.textContent = "☀️";
}

// Toggle theme
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  themeToggle.textContent = isDark ? "☀️" : "🌙";
  localStorage.setItem("hardwareTheme", isDark ? "dark" : "light");
});





/*sticky note section */

document.addEventListener("DOMContentLoaded", () => {
  const addBtn = document.getElementById("addStickyNoteBtn");
  let notes = JSON.parse(localStorage.getItem("stickyNotes")) || [];
  const colors = ["#fff8a6", "#a6f1ff", "#ffa6f1", "#d4ffa6", "#ffdba6", "#f8c8dc", "#a6ffd6"];

  // Render saved notes
  notes.forEach(note => createSticky(note.id, note.text, note.x, note.y, note.color, note.angle || 0));

  // Add new note
  addBtn.addEventListener("click", () => {
     const id = Date.now();
     const color = colors[Math.floor(Math.random() * colors.length)];
     const noteData = { id, text: "", x: 100, y: 100, color, angle: 0 };
     notes.push(noteData);
     localStorage.setItem("stickyNotes", JSON.stringify(notes));
     createSticky(id, "", 1000, 500, color, 0);
  });

  function createSticky(id, text, x, y, color, angle) {
    const note = document.createElement("div");
    note.className = "sticky-note";
    note.style.left = x + "px";
    note.style.top = y + "px";
    note.style.background = color;
    note.style.transform = `rotate(${angle}deg)`;
    note.dataset.id = id;

    note.innerHTML = `
       <div class="note-header">
      
        <button class="deleteNote" title="Delete">✖</button>
      </div>
      <textarea>${text}</textarea>
      <div class="rotate-handle" title="Rotate"></div>
    `;

    document.body.appendChild(note);

    // Create floating color picker
    const palette = document.createElement("div");
    palette.className = "color-palette";
    palette.style.left = (x + 230) + "px";
    palette.style.top = y + "px";
    colors.forEach(c => {
      const btn = document.createElement("div");
      btn.className = "color-btn";
      btn.style.background = c;
      btn.addEventListener("click", () => {
        note.style.background = c;
        const n = notes.find(n => n.id === id);
        n.color = c;
        localStorage.setItem("stickyNotes", JSON.stringify(notes));
      });
      palette.appendChild(btn);
    });
    document.body.appendChild(palette);

    const textarea = note.querySelector("textarea");
    const deleteBtn = note.querySelector(".deleteNote");
    const rotateHandle = note.querySelector(".rotate-handle");

    // Save text changes
    textarea.addEventListener("input", () => {
      const n = notes.find(n => n.id === id);
      n.text = textarea.value;
      localStorage.setItem("stickyNotes", JSON.stringify(notes));
    });

    // Delete note
    deleteBtn.addEventListener("click", () => {
      note.remove();
      palette.remove();
      notes = notes.filter(n => n.id !== id);
      localStorage.setItem("stickyNotes", JSON.stringify(notes));
    });

    // Dragging logic
    let isDragging = false, offsetX, offsetY;
    note.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "BUTTON" || e.target.classList.contains("rotate-handle")) return;
      isDragging = true;
      offsetX = e.clientX - note.getBoundingClientRect().left;
      offsetY = e.clientY - note.getBoundingClientRect().top;
      note.style.cursor = "grabbing";
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        note.style.cursor = "move";
        const rect = note.getBoundingClientRect();
        const n = notes.find(n => n.id === id);
        n.x = rect.left;
        n.y = rect.top;
        palette.style.left = (rect.left + 230) + "px";
        palette.style.top = rect.top + "px";
        localStorage.setItem("stickyNotes", JSON.stringify(notes));
      }
      isRotating = false;
      document.body.style.cursor = "default";
    });

    document.addEventListener("mousemove", (e) => {
      if (isDragging) {
        note.style.left = e.clientX - offsetX + "px";
        note.style.top = e.clientY - offsetY + "px";
        palette.style.left = (e.clientX - offsetX + 230) + "px";
        palette.style.top = (e.clientY - offsetY) + "px";
      } else if (isRotating) {
        const rect = note.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const angleDeg = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
        note.style.transform = `rotate(${angleDeg}deg)`;
        const n = notes.find(n => n.id === id);
        n.angle = angleDeg;
        localStorage.setItem("stickyNotes", JSON.stringify(notes));
      }
    });

/* Rotation logic for the sticky card */
    let isRotating = false;
    rotateHandle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      isRotating = true;
      document.body.style.cursor = "grabbing";
    });
  }
});

/* Rotation logic for the sticky card */
const toolbar1 = document.getElementById("toolbar1");
const toggleBtn1 = document.getElementById("toolbar1Toggle");

toggleBtn1.addEventListener("click", () => {
  toolbar1.classList.toggle("visible");

  // Flip arrow direction and tooltip
  if (toolbar1.classList.contains("visible")) {
    toggleBtn1.textContent = "⚙️"; // pointing left
    toggleBtn1.title = "Hide Toolbar";
  } else {
    toggleBtn1.textContent = "⚙️"; // pointing right
    toggleBtn1.title = "Show Toolbar";
  }
});

/*this button only show on mobile mode */


const mobileActionBtn = document.getElementById("mobileActionBtn");

mobileActionBtn.addEventListener("click", () => {
  // Toggle the action buttons in the table
  showActionButtons = !showActionButtons; // use existing variable
  document.querySelectorAll(".action-btns").forEach(div => {
    div.style.display = showActionButtons ? "flex" : "none";
  });

  // Open the Add Hardware modal
  const addHardwareModal = document.getElementById("addHardwareModal");
  if (addHardwareModal) {
    addHardwareModal.style.display = "flex"; // or your preferred show method
  }
});

const modal = document.getElementById("instructionModal");
  const openBtn = document.getElementById("openModalBtn");
  const closeBtn = document.getElementById("closeModalBtn");

  openBtn.onclick = () => modal.style.display = "block";
  closeBtn.onclick = () => modal.style.display = "none";
  window.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };


