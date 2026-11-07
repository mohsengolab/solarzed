// Solarzed product catalog. SAMPLE DATA — replace with the approved Solarzed catalog.
// Each series has its own page (products.html?series=<id>). In `products`, use `image` for a
// product photo, otherwise `swatch` (a CSS colour or gradient) draws a film roll in that shade.
// Keep spec values as "Pending test data" until they are verified for that product.
window.SOLARZED_CATALOG={
 sample:true,
 categories:[
  {id:'tint',label:'Window film',structure:[['Hard coat','Protects the film surface during daily use'],['Optical film','Sets the shade and clarity of the glass'],['Mounting adhesive','Bonds the film evenly to the inside of the glass'],['Release liner','Removed by the installer before application']]},
  {id:'ppf',label:'Paint protection film',structure:[['Top coat','The outer surface that faces the road'],['TPU film','The flexible protective body of the film'],['Adhesive','Holds the film to the paint and allows clean removal'],['Release liner','Removed by the installer before application']]}
 ],
 series:[
  {id:'tint-essential',category:'tint',name:'Essential Series',tagline:'Everyday window film, clearly documented.',banner:'assets/city.jpg',
   description:'A dependable window film for daily driving, offered in a range of shades. Every installation is registered window by window with a Solarzed digital warranty.',
   specs:[['Film type','Window film'],['Roll size','Pending'],['Shades','5 – 50% VLT'],['UV rejection','Pending test data'],['IR rejection','Pending test data'],['Warranty','Per approved terms']],
   products:[{model:'SZ-E05',name:'Essential 5',swatch:'#121619'},{model:'SZ-E15',name:'Essential 15',swatch:'#1f262c'},{model:'SZ-E35',name:'Essential 35',swatch:'#3b4650'},{model:'SZ-E50',name:'Essential 50',swatch:'#66737d'}]},
  {id:'tint-premium',category:'tint',name:'Premium IR Series',tagline:'Our higher heat-performance tier.',banner:'assets/city.jpg',
   description:'For drivers who want stronger heat control. Every production batch is checked against the defined Solarzed criteria before it carries the Premium IR name.',
   specs:[['Film type','Window film'],['Roll size','Pending'],['Shades','15 – 70% VLT'],['UV rejection','Pending test data'],['IR rejection','Pending test data'],['Warranty','Per approved terms']],
   products:[{model:'SZ-P15',name:'Premium IR 15',swatch:'#17222b'},{model:'SZ-P35',name:'Premium IR 35',swatch:'#33505e'},{model:'SZ-P50',name:'Premium IR 50',swatch:'#587c8a'},{model:'SZ-P70',name:'Premium IR 70',swatch:'#93b4be'}]},
  {id:'ppf-clear',category:'ppf',name:'Clear PPF Series',tagline:'Invisible protection for the original paint.',banner:'assets/dominate.jpg',
   description:'A clear protective layer for the original paint, applied to selected panels or as a full-body cover — and recorded panel by panel in the warranty.',
   specs:[['Film type','Paint protection film'],['Roll size','Pending'],['Finish','Gloss / Matte'],['Thickness','Pending test data'],['Top coat','Pending test data'],['Warranty','Per approved terms']],
   products:[{model:'SZ-PPF-G',name:'Clear Gloss',swatch:'linear-gradient(180deg,#f7fbfd,#d9e6ec)'},{model:'SZ-PPF-M',name:'Clear Matte',swatch:'linear-gradient(180deg,#e9eef1,#c3ced4)'}]},
  {id:'ppf-color',category:'ppf',name:'Color PPF Series',tagline:'A new finish. Protection underneath.',banner:'assets/matrix.jpg',
   description:'Coloured paint protection film that changes the look of the vehicle while protecting the paint underneath, with every covered panel kept on record.',
   specs:[['Film type','Colour paint protection film'],['Roll size','Pending'],['Finish','Gloss / Metallic / Matte'],['Thickness','Pending test data'],['Top coat','Pending test data'],['Warranty','Per approved terms']],
   products:[{model:'SZ-CP-01',name:'Liquid Silver',swatch:'linear-gradient(180deg,#f4f6f8,#9aa4ad 55%,#e6ebef)'},{model:'SZ-CP-02',name:'Graphite Grey',swatch:'linear-gradient(180deg,#7b838b,#2c3238 60%,#5b636b)'},{model:'SZ-CP-03',name:'Deep Blue',swatch:'linear-gradient(180deg,#3b6cb3,#0d2350 60%,#2a4f8a)'},{model:'SZ-CP-04',name:'Racing Orange',swatch:'linear-gradient(180deg,#ffab52,#d9480f 60%,#ff7a1a)'},{model:'SZ-CP-05',name:'Satin Black',swatch:'linear-gradient(180deg,#4a4d50,#0c0d0e 60%,#2a2c2e)'},{model:'SZ-CP-06',name:'Royal Green',swatch:'linear-gradient(180deg,#3aa86d,#0c3d27 60%,#25744a)'}]}
 ]
};
