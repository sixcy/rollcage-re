
int FUN_00413ac0(void)

{
  short sVar1;
  int iVar2;
  int in_ECX;
  int in_EDX;
  int iVar3;
  char *pcVar4;
  int iVar5;
  uint local_c;
  uint local_8;
  
  iVar3 = 0;
  local_c = 0;
  pcVar4 = (char *)(((uint)*(ushort *)(DAT_00791594 + 0x2e) + in_EDX) * 0x10 + DAT_00791590);
  local_8 = 8;
  if (in_EDX != 0) {
    if ((((pcVar4[8] == '\0' && pcVar4[5] == '\0') && pcVar4[1] == '\0') && *pcVar4 == '\0') &&
       ((byte)(pcVar4[0xb] & pcVar4[10] & pcVar4[9] & pcVar4[4]) == 0xff)) {
      iVar3 = 1;
    }
    else {
      iVar3 = 0;
    }
  }
  iVar5 = 0x20;
  iVar2 = in_ECX * 0xc00 + DAT_0079dc2c + 0x21;
  do {
    if (iVar3 == 0) {
      *(undefined2 *)(iVar2 + 0x1d) = 0x3f;
    }
    else {
      *(undefined2 *)(iVar2 + 0x1d) = *(undefined2 *)(pcVar4 + 6);
      *(undefined2 *)(iVar2 + -1) = 0x8080;
      sVar1 = (&DAT_00513260)[local_c];
      *(char *)(iVar2 + 0x1c) = (char)((short)(&DAT_005132e0)[local_c] * 0xfe >> 0xf) + -0x80;
      *(char *)(iVar2 + 0x1b) = (char)(sVar1 * 0xfe >> 0xf) + -0x80;
      sVar1 = (&DAT_00513260)[local_8];
      *(char *)(iVar2 + 0x38) = (char)((short)(&DAT_005132e0)[local_8] * 0xfe >> 0xf) + -0x80;
      *(char *)(iVar2 + 0x37) = (char)(sVar1 * 0xfe >> 0xf) + -0x80;
      local_c = local_8;
      local_8 = local_8 + 8 & 0xff;
    }
    iVar2 = iVar2 + 0x60;
    iVar5 = iVar5 + -1;
  } while (iVar5 != 0);
  return iVar3;
}

