
undefined4 FUN_00406070(void)

{
  short *psVar1;
  int in_ECX;
  int iVar2;
  uint uVar3;
  
  uVar3 = (uint)*(ushort *)(in_ECX + 0x6c6);
  psVar1 = (short *)(*(int *)(DAT_00791598 + 0x60) + (uint)*(ushort *)(in_ECX + 0x6c4) * 0xc);
  if (*(char *)(*(int *)(psVar1 + 4) + 7 + uVar3 * 0x10) != -1) {
    return 1;
  }
  iVar2 = 0;
  do {
    if ((char)psVar1[1] == '\0') {
      if ((ushort)uVar3 == (ushort)(*psVar1 - 1U)) {
        if ((char)psVar1[2] == '\0') {
          return 0;
        }
        uVar3 = 0;
      }
      else {
        uVar3 = uVar3 + 1;
LAB_004060e6:
        uVar3 = uVar3 & 0xffff;
      }
    }
    else {
      if ((ushort)uVar3 != 0) {
        uVar3 = uVar3 - 1;
        goto LAB_004060e6;
      }
      uVar3 = (uint)(ushort)(*psVar1 - 1U);
      if ((char)psVar1[2] == '\0') {
        return 0;
      }
    }
    if (*(char *)(*(int *)(psVar1 + 4) + 7 + uVar3 * 0x10) != -1) {
      return 1;
    }
    iVar2 = iVar2 + 1;
    if (8 < iVar2) {
      return 0;
    }
  } while( true );
}

