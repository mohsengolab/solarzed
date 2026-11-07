document.querySelectorAll('.sv-dropdown').forEach(dropdown=>{dropdown.addEventListener('keydown',event=>{if(event.key==='Escape')dropdown.open=false;});});
document.addEventListener('click',event=>{document.querySelectorAll('.sv-dropdown[open]').forEach(dropdown=>{if(!dropdown.contains(event.target))dropdown.open=false;});});
