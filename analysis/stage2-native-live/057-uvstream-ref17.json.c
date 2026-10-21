
void FUN_004e3520(void)

{
  int *piVar1;
  uint *puVar2;
  uint uVar3;
  int iVar4;
  size_t _NewSize;
  void *pvVar5;
  int *in_ECX;
  undefined4 *in_EDX;
  int iVar6;
  int iVar7;
  int iVar8;
  
  iVar6 = (int)((ulonglong)((longlong)(int)in_EDX[1] * -0x7f7f7f7f) >> 0x20) + in_EDX[1];
  iVar8 = (iVar6 >> 7) - (iVar6 >> 0x1f);
  iVar6 = in_ECX[3];
  if (iVar6 != 0) {
    piVar1 = in_ECX + 2;
    *piVar1 = *piVar1 - iVar6;
    if (*piVar1 != 0) {
      memmove((void *)*in_ECX,(void *)(iVar6 + *in_ECX),in_ECX[2]);
    }
    in_ECX[3] = 0;
  }
  if (in_ECX[1] <= in_ECX[2] + in_EDX[1]) {
    _NewSize = in_EDX[1] + 0x400 + in_ECX[1];
    in_ECX[1] = _NewSize;
    pvVar5 = realloc((void *)*in_ECX,_NewSize);
    *in_ECX = (int)pvVar5;
  }
  if (in_ECX[6] <= in_ECX[7] + iVar8 + 1) {
    iVar6 = in_ECX[6] + 0x20 + iVar8 + 1;
    in_ECX[6] = iVar6;
    pvVar5 = realloc((void *)in_ECX[4],iVar6 * 4);
    in_ECX[4] = (int)pvVar5;
    pvVar5 = realloc((void *)in_ECX[5],in_ECX[6] << 3);
    in_ECX[5] = (int)pvVar5;
  }
  memcpy((void *)(in_ECX[2] + *in_ECX),(void *)*in_EDX,in_EDX[1]);
  in_ECX[2] = in_ECX[2] + in_EDX[1];
  iVar6 = 0;
  if (0 < iVar8) {
    do {
      *(undefined4 *)(in_ECX[4] + (in_ECX[7] + iVar6) * 4) = 0xff;
      iVar4 = in_ECX[5];
      iVar7 = in_ECX[7] + iVar6;
      iVar6 = iVar6 + 1;
      *(int *)(iVar4 + iVar7 * 8) = in_ECX[0x58];
      *(int *)(iVar4 + 4 + iVar7 * 8) = in_ECX[0x59];
    } while (iVar6 < iVar8);
  }
  *(int *)(in_ECX[4] + (in_ECX[7] + iVar6) * 4) = (int)in_EDX[1] % 0xff;
  iVar4 = in_ECX[7];
  iVar7 = in_ECX[5];
  *(undefined4 *)(iVar7 + (iVar4 + iVar6) * 8) = in_EDX[4];
  *(undefined4 *)(iVar7 + 4 + (iVar4 + iVar6) * 8) = in_EDX[5];
  iVar6 = in_ECX[7] + iVar6;
  in_ECX[0x58] = *(int *)(in_ECX[5] + iVar6 * 8);
  in_ECX[0x59] = *(int *)(in_ECX[5] + 4 + iVar6 * 8);
  puVar2 = (uint *)(in_ECX[4] + in_ECX[7] * 4);
  *puVar2 = *puVar2 | 0x100;
  in_ECX[7] = in_ECX[7] + iVar8 + 1;
  puVar2 = (uint *)(in_ECX + 0x56);
  uVar3 = *puVar2;
  *puVar2 = *puVar2 + 1;
  in_ECX[0x57] = in_ECX[0x57] + (uint)(0xfffffffe < uVar3);
  if (in_EDX[3] != 0) {
    in_ECX[0x52] = 1;
  }
  return;
}

