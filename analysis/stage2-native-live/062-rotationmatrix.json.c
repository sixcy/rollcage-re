
int FUN_004452b0(void)

{
  uint in_ECX;
  int iVar1;
  
  iVar1 = (in_ECX ^ (int)in_ECX >> 0x1f) - ((int)in_ECX >> 0x1f);
  if (0x6487f < iVar1) {
    iVar1 = iVar1 + -0x6487f;
  }
  if (iVar1 < 0x19221) {
    return *(int *)(&DAT_004f0a70 + (iVar1 >> 9) * 4);
  }
  if (iVar1 < 0x32440) {
    return -*(int *)(&DAT_004f0a70 + (0x3243f - iVar1 >> 9) * 4);
  }
  if (0x3243f < iVar1 && iVar1 < 0x4b660) {
    return -*(int *)(&DAT_004f0a70 + (iVar1 + -0x3243f >> 9) * 4);
  }
  if (0x4b65f < iVar1 && iVar1 < 0x64880) {
    return *(int *)(&DAT_004f0a70 + (0x6487f - iVar1 >> 9) * 4);
  }
  return 0;
}

