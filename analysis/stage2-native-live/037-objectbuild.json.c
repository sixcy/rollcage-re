
void FUN_00491db0(void)

{
  int iVar1;
  int in_ECX;
  int iVar2;
  int iVar3;
  int iVar4;
  
  if (*(char *)(in_ECX + 0x17c) != '\0') {
    iVar3 = *(int *)(in_ECX + 0x10);
    iVar2 = 0;
    iVar4 = (uint)*(ushort *)(iVar3 + 0x34) + iVar3;
    if (*(char *)(iVar3 + 0x27) != '\0') {
      iVar3 = DAT_006b1a44 * 0x14;
      do {
        if ((*(uint *)(*(int *)(in_ECX + 0x178) + iVar2 * 4) & 0x8000000) != 0) {
          DAT_006b1a44 = DAT_006b1a44 + 1;
          iVar1 = *(int *)(DAT_00791594 + 0xec);
          *(int *)(iVar1 + iVar3) = iVar4;
          *(int *)(iVar1 + 4 + iVar3) = in_ECX;
          iVar3 = iVar3 + 0x14;
        }
        iVar2 = iVar2 + 1;
        iVar4 = iVar4 + 0x14;
      } while (iVar2 < (int)(uint)*(byte *)(*(int *)(in_ECX + 0x10) + 0x27));
    }
  }
  return;
}

