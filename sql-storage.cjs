const {spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path');
function sqlText(value){return "N'"+String(value).replaceAll("'","''")+"'";}
function createSqlStorage(options={}){
 const database=options.database||process.env.SOLARZED_SQL_DATABASE||'SolarzedWarranty';
 if(!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(database))throw Error('Invalid Solarzed database name.');
 const host=options.host||process.env.SOLARZED_SQL_SERVER||'127.0.0.1';
 const user=options.user||process.env.SOLARZED_SQL_USER||'sa';
 const password=options.password||process.env.SOLARZED_SQL_PASSWORD;
 if(!password)throw Error('SQL password is required through SOLARZED_SQL_PASSWORD.');
 const executable=process.env.SOLARZED_SQLCMD||'sqlcmd';
 function run(query,target=database){return new Promise((resolve,reject)=>{
  const child=spawn(executable,['-S',host,'-U',user,'-d',target,'-C','-b','-l','10','-t','20','-y','0','-w','65535','-f','65001'],{windowsHide:true,env:{...process.env,SQLCMDPASSWORD:password},stdio:['pipe','pipe','pipe']});
  let output='',errors='';const timeout=setTimeout(()=>{child.kill();reject(Error('SQL command timed out.'));},30000);
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);
  child.on('error',()=>{clearTimeout(timeout);reject(Error('SQL client could not be started.'));});
  child.on('close',status=>{clearTimeout(timeout);if(status!==0){const error=Error(/2627|2601|duplicate key/i.test(output+errors)?'Duplicate SQL registration.':'SQL operation failed. Check the SQL service and credentials.');error.duplicate=/2627|2601|duplicate key/i.test(output+errors);reject(error);}else resolve(output);});
  child.stdin.on('error',()=>{});child.stdin.end('SET NOCOUNT ON; SET XACT_ABORT ON;\n'+query+'\nGO\n');
 });}
 async function initialize(){
  await run(`IF DB_ID(${sqlText(database)}) IS NULL EXEC(N'CREATE DATABASE [${database}]');`,'master');
  await run(`IF OBJECT_ID(N'dbo.WarrantyRegistrations',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.WarrantyRegistrations (
  Code varchar(19) NOT NULL CONSTRAINT PK_SolarzedWarranty PRIMARY KEY,
  FilmSerial nvarchar(120) NOT NULL,
  InvoiceNumber nvarchar(120) NOT NULL,
  Payload nvarchar(max) NOT NULL,
  CreatedAt datetime2 NOT NULL CONSTRAINT DF_SolarzedWarrantyCreated DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_SolarzedWarrantyJson CHECK(ISJSON(Payload)=1),
  CONSTRAINT UQ_SolarzedSerialInvoice UNIQUE(FilmSerial,InvoiceNumber)
 );
END;`);
  await run(`IF OBJECT_ID(N'dbo.SolarzedDocuments',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.SolarzedDocuments (
  Collection varchar(40) NOT NULL,
  Id nvarchar(80) NOT NULL,
  Payload nvarchar(max) NOT NULL,
  UpdatedAt datetime2 NOT NULL CONSTRAINT DF_SolarzedDocumentsUpdated DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_SolarzedDocuments PRIMARY KEY(Collection,Id),
  CONSTRAINT CK_SolarzedDocumentsJson CHECK(ISJSON(Payload)=1)
 );
END;`);
 }
 async function load(){const output=await run("SELECT N'SZJSON:' + COALESCE((SELECT JSON_QUERY(Payload) AS record FROM dbo.WarrantyRegistrations ORDER BY CreatedAt FOR JSON PATH),N'[]');");const start=output.indexOf('SZJSON:');if(start<0)throw Error('SQL response was invalid.');return JSON.parse(output.slice(start+7).trim()).map(row=>row.record);}
 async function persist(records){if(!records.length)return;const payload=sqlText(JSON.stringify(records));await run(`DECLARE @records nvarchar(max)=${payload};
BEGIN TRANSACTION;
MERGE dbo.WarrantyRegistrations WITH (HOLDLOCK) AS target
USING (SELECT JSON_VALUE(value,'$.code') AS Code,JSON_VALUE(value,'$.serial') AS FilmSerial,JSON_VALUE(value,'$.invoice') AS InvoiceNumber,value AS Payload FROM OPENJSON(@records)) AS source
ON target.Code=source.Code
WHEN MATCHED THEN UPDATE SET Payload=source.Payload
WHEN NOT MATCHED THEN INSERT(Code,FilmSerial,InvoiceNumber,Payload) VALUES(source.Code,source.FilmSerial,source.InvoiceNumber,source.Payload);
COMMIT TRANSACTION;`);}
 async function migrateFile(file){let records;try{records=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return 0;throw error;}if(!Array.isArray(records))throw Error('Local registration file is invalid.');const existing=await load();const known=new Set(existing.map(r=>r.code));const incoming=records.filter(r=>!known.has(r.code));if(incoming.length)await persist(incoming);return incoming.length;}
 // Rolls, settings and other admin documents share one keyed JSON table.
 function collection(name){
  if(!/^[a-z][a-z0-9_]{0,39}$/.test(name))throw Error('Invalid collection name.');
  return {
   async load(){const output=await run(`SELECT N'SZJSON:' + COALESCE((SELECT JSON_QUERY(Payload) AS item FROM dbo.SolarzedDocuments WHERE Collection=${sqlText(name)} ORDER BY UpdatedAt FOR JSON PATH),N'[]');`);const start=output.indexOf('SZJSON:');if(start<0)throw Error('SQL response was invalid.');return JSON.parse(output.slice(start+7).trim()).map(row=>row.item);},
   async persist(items){if(!items.length)return;await run(`DECLARE @items nvarchar(max)=${sqlText(JSON.stringify(items))};
BEGIN TRANSACTION;
MERGE dbo.SolarzedDocuments WITH (HOLDLOCK) AS target
USING (SELECT JSON_VALUE(value,'$.id') AS Id,value AS Payload FROM OPENJSON(@items)) AS source
ON target.Collection=${sqlText(name)} AND target.Id=source.Id
WHEN MATCHED THEN UPDATE SET Payload=source.Payload,UpdatedAt=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT(Collection,Id,Payload) VALUES(${sqlText(name)},source.Id,source.Payload);
COMMIT TRANSACTION;`);}};
 }
 return {kind:'mssql',database,initialize,load,persist,migrateFile,run,collection};
}
async function configuredStorage(){if(process.env.SOLARZED_STORAGE!=='mssql')return undefined;const storage=createSqlStorage();await storage.initialize();const count=await storage.migrateFile(path.join(__dirname,'.data','registrations.json'));if(count)console.log(`Migrated ${count} local installation records to SQL Server.`);return storage;}
module.exports={createSqlStorage,configuredStorage,sqlText};
