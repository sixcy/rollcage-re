import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import java.io.*;
public class ExportFirebugs extends GhidraScript {
 public void run() throws Exception {
  String[] args=getScriptArgs();
  DecompInterface di=new DecompInterface();di.openProgram(currentProgram);
  PrintWriter out=new PrintWriter(new FileWriter(args[0]));
  FunctionIterator funcs=currentProgram.getFunctionManager().getFunctions(true);
  while(funcs.hasNext()){Function f=funcs.next(); out.println("\n// FUNCTION "+f.getEntryPoint()+" "+f.getName()+" "+f.getBody()); DecompileResults r=di.decompileFunction(f,15,monitor);if(r.decompileCompleted())out.println(r.getDecompiledFunction().getC());else out.println("// FAILED "+r.getErrorMessage());}
  out.close();di.dispose();
 }
}
