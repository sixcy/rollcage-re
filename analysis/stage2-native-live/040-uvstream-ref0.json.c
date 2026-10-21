
void FUN_004121d0(void)

{
  char cVar1;
  undefined *puVar2;
  uint uVar3;
  uint *in_ECX;
  undefined4 *puVar4;
  
  puVar2 = PTR_DAT_00513210;
  if (in_ECX != (uint *)0x0) {
    uVar3 = *in_ECX & 0x1ff;
    if (uVar3 == 3) {
      uVar3 = 0;
      if ((byte)PTR_DAT_00513210[0x27c] != 0) {
        puVar4 = &DAT_00768e20;
        do {
          if ((uint *)*puVar4 == in_ECX) goto LAB_00412281;
          uVar3 = uVar3 + 1;
          puVar4 = puVar4 + 0x10d;
        } while (uVar3 < (byte)PTR_DAT_00513210[0x27c]);
      }
      uVar3 = 0xff;
    }
    else if (uVar3 == 0xc) {
      uVar3 = 0;
      while (((uint *)(&DAT_006ba580)[uVar3] != in_ECX ||
             ((((uint *)(&DAT_006ba580)[uVar3])[0x5a] & 0xffff0000) == 0))) {
        uVar3 = uVar3 + 1;
        if (0x25 < uVar3) {
          return;
        }
      }
      uVar3 = FUN_00412190();
    }
    else {
      if (uVar3 != 0x11) {
        return;
      }
      uVar3 = 0;
      while (((uint *)(&DAT_006ba570)[uVar3] != in_ECX ||
             (((uint *)(&DAT_006ba570)[uVar3])[0x61] == 0))) {
        uVar3 = uVar3 + 1;
        if (3 < uVar3) {
          return;
        }
      }
      uVar3 = FUN_00412190();
    }
LAB_00412281:
    if ((((uVar3 & 0xff) != 0xff) &&
        (((cVar1 = puVar2[0x280], cVar1 == '\a' || (cVar1 == '\x0f')) &&
         (*(int *)(puVar2 + 0x2b0) < 7)))) && (puVar2[0x2c0] == '\0')) {
      if (cVar1 == '\x0f') {
        FUN_004991a0();
        DAT_0060e250 = DAT_0060e250 + 1;
        return;
      }
      *(short *)(puVar2 + (uVar3 & 0xff) * 8 + 0xe2) =
           *(short *)(puVar2 + (uVar3 & 0xff) * 8 + 0xe2) + 1;
      FUN_004991a0();
      DAT_0060e250 = DAT_0060e250 + 1;
    }
  }
  return;
}

