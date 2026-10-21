
undefined4 FUN_00434ff0(void)

{
  uint *in_ECX;
  uint *in_EDX;
  uint uVar1;
  
  uVar1 = *in_EDX & 0x1ff;
  switch(*in_ECX & 0x1ff) {
  case 3:
    if (uVar1 == 3) {
      if (PTR_DAT_00513210[0x280] != '\x01') {
        return 0;
      }
      return 1;
    }
    if (uVar1 == 0xc) {
      if ((uint *)in_EDX[0x5e] != in_ECX) {
        return 0;
      }
      return 1;
    }
    if (uVar1 != 0x11) {
      return 0;
    }
    if ((uint *)in_EDX[0x59] != in_ECX) {
      return 0;
    }
    if (0x3b < (int)in_EDX[0x62]) {
      return 0;
    }
    return 1;
  case 4:
    goto switchD_00435013_caseD_4;
  default:
    goto switchD_00435013_caseD_5;
  case 0xc:
    if (uVar1 == 0xc) {
      uVar1 = in_ECX[0x5e];
LAB_00435043:
      if (uVar1 != in_EDX[0x5e]) {
        return 0;
      }
switchD_00435013_caseD_4:
      return 1;
    }
    if (uVar1 != 0x11) {
      return 0;
    }
    uVar1 = in_ECX[0x5e];
    break;
  case 0x11:
    if (uVar1 == 0xc) {
      uVar1 = in_ECX[0x59];
      goto LAB_00435043;
    }
    if (uVar1 != 0x11) {
      return 0;
    }
    uVar1 = in_ECX[0x59];
  }
  if (uVar1 == in_EDX[0x59]) {
    return 1;
  }
switchD_00435013_caseD_5:
  return 0;
}

