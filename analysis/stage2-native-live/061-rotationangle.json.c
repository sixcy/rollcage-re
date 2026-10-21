
int FUN_00445360(void)

{
  int in_ECX;
  uint uVar1;
  int iVar2;
  
  uVar1 = (int)(in_ECX + 0x19220U) >> 0x1f;
  iVar2 = (in_ECX + 0x19220U ^ uVar1) - uVar1;
  if (0x6487f < iVar2) {
    iVar2 = iVar2 + -0x6487f;
  }
  if (iVar2 < 0x19221) {
    return -*(int *)(&DAT_004f0a70 + (iVar2 >> 9) * 4);
  }
  if (iVar2 < 0x32440) {
    return *(int *)(&DAT_004f0a70 + (0x3243f - iVar2 >> 9) * 4);
  }
  if (0x3243f < iVar2 && iVar2 < 0x4b660) {
    return *(int *)(&DAT_004f0a70 + (iVar2 + -0x3243f >> 9) * 4);
  }
  if (0x4b65f < iVar2 && iVar2 < 0x64880) {
    return -*(int *)(&DAT_004f0a70 + (0x6487f - iVar2 >> 9) * 4);
  }
  return 0;
}

