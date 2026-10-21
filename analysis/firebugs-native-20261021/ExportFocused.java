import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import java.io.*;
public class ExportFocused extends GhidraScript {
 public void run() throws Exception {
  String[] args=getScriptArgs();
  PrintWriter out=new PrintWriter(new FileWriter(args[0]));
  if(args.length==1){
   FunctionIterator funcs=currentProgram.getFunctionManager().getFunctions(true);
   while(funcs.hasNext()){Function f=funcs.next();out.println("FUNCTION "+f.getEntryPoint()+" "+f.getName());}
   InstructionIterator ins=currentProgram.getListing().getInstructions(true);
   while(ins.hasNext()){Instruction i=ins.next();out.println(i.getAddress()+" "+i.toString());}
  }else{
   DecompInterface di=new DecompInterface();di.openProgram(currentProgram);
   for(int n=1;n<args.length;n++){
    Function f=currentProgram.getFunctionManager().getFunctionContaining(toAddr(args[n]));
    if(f==null){disassemble(toAddr(args[n]));f=createFunction(toAddr(args[n]),null);}
    if(f==null){out.println("NO FUNCTION "+args[n]);continue;}
    out.println("FUNCTION "+f.getEntryPoint()+" "+f.getName());
    DecompileResults r=di.decompileFunction(f,20,monitor);
    if(r.decompileCompleted())out.println(r.getDecompiledFunction().getC());else out.println(r.getErrorMessage());
   }
   di.dispose();
  }
  out.close();
 }
}
