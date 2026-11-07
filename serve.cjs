const {createSolarzedServer,configuredSmsAdapter}=require('./solarzed-server.cjs');
const {configuredStorage}=require('./sql-storage.cjs');
async function main(){
 const port=Number(process.env.PORT||4173),storage=await configuredStorage();
 const server=createSolarzedServer({smsAdapter:configuredSmsAdapter(),storage});
 server.listen(port,'127.0.0.1',()=>{console.log(`Solarzed local preview: http://127.0.0.1:${port} | Storage: ${storage?.kind||'local file'} | Admin: http://127.0.0.1:${port}/admin.html`);if(server.admin.generatedPassword)console.log(`Admin password for this session (set SOLARZED_ADMIN_PASSWORD to choose one): ${server.admin.generatedPassword}`);});
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
