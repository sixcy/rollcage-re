
void FUN_0048a8c0(void)

{
  uint *puVar1;
  undefined4 *puVar2;
  int iVar3;
  uint uVar4;
  byte bVar5;
  uint *in_ECX;
  undefined4 extraout_ECX;
  undefined4 extraout_ECX_00;
  bool bVar6;
  undefined4 uVar7;
  undefined4 uVar8;
  
  if (DAT_0060e2b4 == 1) {
    bVar6 = false;
  }
  else if ((PTR_DAT_00513210[0x2c1] == '\x01') && ((DAT_0076a324 & 1) != 0)) {
    bVar6 = false;
  }
  else {
    bVar6 = true;
  }
  switch((int)*(short *)((int)in_ECX + 0x16a)) {
  case 2:
  case 0x20:
    if (bVar6) {
      if (*(short *)((int)in_ECX + 0x16a) == 2) {
        in_ECX[0x59] = in_ECX[0x59] + 1;
        bVar6 = in_ECX[0x59] == 0x96;
      }
      else {
        puVar1 = in_ECX + 0x59;
        *puVar1 = *puVar1 - 1;
        bVar6 = *puVar1 == 0;
      }
      if (bVar6) {
        *(undefined2 *)((int)in_ECX + 0x16a) = 8;
      }
    }
    FUN_0048ac50();
    FUN_0048ba60();
    FUN_0048b590();
    return;
  default:
    if (bVar6) {
      in_ECX[0x59] = in_ECX[0x59] - 1;
      FUN_0048b590();
      bVar5 = (byte)(in_ECX[0x59] - 1);
      if ((int)(in_ECX[0x59] - 1) < 1) {
        bVar5 = -bVar5;
        in_ECX[0xe] = in_ECX[0xe] + (in_ECX[99] << (bVar5 & 0x1f));
        in_ECX[0xf] = in_ECX[0xf] + (in_ECX[100] << (bVar5 & 0x1f));
        iVar3 = in_ECX[0x65] << (bVar5 & 0x1f);
      }
      else {
        in_ECX[0xe] = in_ECX[0xe] + ((int)in_ECX[99] >> (bVar5 & 0x1f));
        in_ECX[0xf] = in_ECX[0xf] + ((int)in_ECX[100] >> (bVar5 & 0x1f));
        iVar3 = (int)in_ECX[0x65] >> (bVar5 & 0x1f);
      }
      in_ECX[0x10] = in_ECX[0x10] + iVar3;
    }
    if (in_ECX[0x59] != 0) {
      return;
    }
    FUN_0042be70();
    uVar4 = FUN_00480150(in_ECX + 0x18,(int)DAT_0051810a,(int)DAT_0051810c,DAT_00518108,extraout_ECX
                         ,0,0);
    *in_ECX = *in_ECX & 0xffffefff;
    in_ECX[0x5d] = uVar4;
    *(undefined2 *)((int)in_ECX + 0x16a) = 2;
    FUN_00480150(0,(int)DAT_005180e6,(int)DAT_005180e8,DAT_005180e4,extraout_ECX_00,0,
                 *(char *)(in_ECX[0x5e] + 0x6b8) == '\x01');
    uVar4 = in_ECX[0x5e];
    if (*(short *)(uVar4 + 0x724) == 0) {
      return;
    }
    if ((10 < *(byte *)(uVar4 + 0x72a)) && (*(byte *)(uVar4 + 0x72a) != 0)) {
      return;
    }
    *(undefined2 *)(uVar4 + 0x72a) = 0x10a;
    *(undefined2 *)(uVar4 + 0x722) = 200;
    *(undefined1 *)(uVar4 + 0x729) = 0x32;
    return;
  case 4:
    FUN_0048b590();
    uVar8 = 0x40a63;
    uVar7 = 2;
    break;
  case 8:
    FUN_0048b590();
    uVar8 = 0x50228;
    uVar7 = 3;
    break;
  case 0x10:
    if ((bVar6) && (uVar4 = FUN_0048ed10(), (uVar4 & 1) == 0)) {
      *(char *)((int)in_ECX + 0x16e) = *(char *)((int)in_ECX + 0x16e) + -1;
      *(short *)(in_ECX + 0x5b) = (short)in_ECX[0x5b] + 1;
    }
    if ((short)in_ECX[0x5b] == 0x28) {
      *(undefined2 *)(in_ECX + 0x5b) = 0;
    }
    if ('\x01' < *(char *)((int)in_ECX + 0x16e)) {
      return;
    }
    DAT_006ba618._0_1_ = (char)DAT_006ba618 + -1;
    *(undefined2 *)((int)in_ECX + 0x16a) = 0;
    return;
  }
  FUN_0042b160(uVar7,uVar8,0xb);
  FUN_00437b60();
  FUN_0041e880();
  puVar2 = (undefined4 *)in_ECX[0x5d];
  in_ECX[0x59] = 0;
  *(undefined2 *)((int)in_ECX + 0x16a) = 0x10;
  if (puVar2 == (undefined4 *)&DAT_0000007f) {
    return;
  }
  if (((undefined4 *)0x100 < puVar2) && (puVar2 != (undefined4 *)0x0)) {
    (**(code **)(*(int *)*puVar2 + 0x38))();
  }
  in_ECX[0x5d] = 0x7f;
  return;
}

