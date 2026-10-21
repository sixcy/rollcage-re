import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import java.io.*;
public class ForceFirebugs extends GhidraScript {
 public void run() throws Exception {
  String[] args=getScriptArgs();
  // Preserve raw bytes; correct only analysis metadata for the loader tail,
  // which auto-analysis omitted after a falsely inferred non-returning malloc.
  Function malloc=getFunctionAt(toAddr("8001f02c"));if(malloc!=null)malloc.setNoReturn(false);
  disassemble(toAddr("8006170c"));
  PrintWriter out=new PrintWriter(new FileWriter(args[0]));
  InstructionIterator ins=currentProgram.getListing().getInstructions(toAddr("80060b28"),true);
  while(ins.hasNext()){Instruction i=ins.next();if(i.getAddress().compareTo(toAddr("800625cc"))>=0)break;out.println(i.getAddress()+" "+i.toString());}
  out.close();
 }
}
