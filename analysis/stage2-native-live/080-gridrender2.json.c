
void FUN_004077c0(void)

{
  int iVar1;
  int iVar2;
  char cVar3;
  int in_ECX;
  uint uVar4;
  
  iVar2 = DAT_00791598;
  if (*(byte *)(in_ECX + 0x18a) != 0) {
    uVar4 = (uint)*(byte *)(in_ECX + 0x18a);
    iVar1 = *(int *)(DAT_00791598 + 0x60) + uVar4 * 0xc;
    cVar3 = *(char *)(iVar1 + 3);
    if ((((cVar3 != '\0') && (cVar3 = cVar3 + -1, *(char *)(iVar1 + 3) = cVar3, cVar3 == '\0')) &&
        (*(int *)(*(int *)(iVar2 + 0x94) + uVar4 * 4) == 0)) &&
       ((*(byte *)(*(int *)(iVar2 + 0x60) + 7 + uVar4 * 0xc) & 1) == 0)) {
      FUN_00407dd0();
    }
  }
  if (*(byte *)(in_ECX + 0x18b) != 0) {
    uVar4 = (uint)*(byte *)(in_ECX + 0x18b);
    iVar1 = *(int *)(iVar2 + 0x60) + uVar4 * 0xc;
    cVar3 = *(char *)(iVar1 + 3);
    if (((cVar3 != '\0') && (cVar3 = cVar3 + -1, *(char *)(iVar1 + 3) = cVar3, cVar3 == '\0')) &&
       ((*(int *)(*(int *)(iVar2 + 0x94) + uVar4 * 4) == 0 &&
        ((*(byte *)(*(int *)(iVar2 + 0x60) + 7 + uVar4 * 0xc) & 1) == 0)))) {
      FUN_00407dd0();
      return;
    }
  }
  return;
}

