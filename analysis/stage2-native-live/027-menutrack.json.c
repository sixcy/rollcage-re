
void FUN_0047a3b0(void)

{
  undefined4 uVar1;
  undefined4 uVar2;
  undefined1 uVar3;
  int iVar4;
  undefined1 uVar5;
  ushort uVar6;
  byte *pbVar7;
  int local_14;
  int local_10;
  ushort *local_8;
  
  local_14 = 5;
  local_10 = 0;
  local_8 = &DAT_006bfad6;
  do {
    pbVar7 = (byte *)((*(ushort *)(DAT_006c0b50 + 0x2e) + 0x40 + local_10) * 0x10 + DAT_00791590);
    uVar1 = *(undefined4 *)(pbVar7 + 4);
    uVar2 = *(undefined4 *)pbVar7;
    uVar3 = (undefined1)uVar2;
    *(undefined1 *)(local_8 + -1) = uVar3;
    local_8[-0xffffffff00000009] = 0xfefe;
    local_8[-0xffffffff00000008] = 0xbcfe;
    uVar6 = (ushort)((uint)uVar1 >> 0x10) & 0x3f | 0x80;
    local_8[-0xffffffff00000003] = 0;
    local_8[-0xffffffff00000002] = 0x4040;
    *local_8 = uVar6;
    uVar5 = (undefined1)((uint)uVar2 >> 8);
    *(undefined1 *)((int)local_8 + -1) = uVar5;
    local_8[5] = (ushort)pbVar7[4] - (ushort)*pbVar7;
    local_8[6] = (ushort)pbVar7[9] - (ushort)pbVar7[1];
    *(float *)(local_8 + 1) =
         (float)((int)((((uint)pbVar7[4] - (uint)*pbVar7) + 1) * DAT_00696ae8) >> 8);
    *(float *)(local_8 + 3) =
         (float)((int)((((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * DAT_00696aec) >> 8);
    iVar4 = (((uint)pbVar7[4] - (uint)*pbVar7) + 1) * 0xb;
    *(float *)(local_8 + 1) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696ae8 >> 8);
    iVar4 = (((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * 0xb;
    *(float *)(local_8 + 3) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696aec >> 8);
    local_8[0x51] = 0xfefe;
    local_8[0x52] = 0xbcfe;
    local_8[0x5a] = uVar6;
    local_8[0x57] = 0;
    local_8[0x58] = 0x4040;
    *(undefined1 *)(local_8 + 0x59) = uVar3;
    *(undefined1 *)((int)local_8 + 0xb3) = uVar5;
    local_8[0x5f] = (ushort)pbVar7[4] - (ushort)*pbVar7;
    local_8[0x60] = (ushort)pbVar7[9] - (ushort)pbVar7[1];
    *(float *)(local_8 + 0x5b) =
         (float)((int)((((uint)pbVar7[4] - (uint)*pbVar7) + 1) * DAT_00696ae8) >> 8);
    *(float *)(local_8 + 0x5d) =
         (float)((int)((((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * DAT_00696aec) >> 8);
    iVar4 = (((uint)pbVar7[4] - (uint)*pbVar7) + 1) * 0xb;
    *(float *)(local_8 + 0x5b) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696ae8 >> 8);
    iVar4 = (((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * 0xb;
    *(float *)(local_8 + 0x5d) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696aec >> 8);
    local_8[0xab] = 0xfefe;
    local_8[0xac] = 0xbcfe;
    local_8[0xb4] = uVar6;
    local_8[0xb1] = 0;
    local_8[0xb2] = 0x4040;
    *(undefined1 *)(local_8 + 0xb3) = uVar3;
    *(undefined1 *)((int)local_8 + 0x167) = uVar5;
    local_8[0xb9] = (ushort)pbVar7[4] - (ushort)*pbVar7;
    local_8[0xba] = (ushort)pbVar7[9] - (ushort)pbVar7[1];
    *(float *)(local_8 + 0xb5) =
         (float)((int)((((uint)pbVar7[4] - (uint)*pbVar7) + 1) * DAT_00696ae8) >> 8);
    *(float *)(local_8 + 0xb7) =
         (float)((int)((((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * DAT_00696aec) >> 8);
    iVar4 = (((uint)pbVar7[4] - (uint)*pbVar7) + 1) * 0xb;
    *(float *)(local_8 + 0xb5) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696ae8 >> 8);
    iVar4 = (((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * 0xb;
    *(float *)(local_8 + 0xb7) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696aec >> 8);
    local_8[0x105] = 0xfefe;
    local_8[0x106] = 0xbcfe;
    local_8[0x10e] = uVar6;
    local_8[0x10b] = 0;
    local_8[0x10c] = 0x4040;
    *(undefined1 *)(local_8 + 0x10d) = uVar3;
    *(undefined1 *)((int)local_8 + 0x21b) = uVar5;
    local_8[0x113] = (ushort)pbVar7[4] - (ushort)*pbVar7;
    local_8[0x114] = (ushort)pbVar7[9] - (ushort)pbVar7[1];
    *(float *)(local_8 + 0x10f) =
         (float)((int)((((uint)pbVar7[4] - (uint)*pbVar7) + 1) * DAT_00696ae8) >> 8);
    *(float *)(local_8 + 0x111) =
         (float)((int)((((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * DAT_00696aec) >> 8);
    iVar4 = (((uint)pbVar7[4] - (uint)*pbVar7) + 1) * 0xb;
    *(float *)(local_8 + 0x10f) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696ae8 >> 8);
    iVar4 = (((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * 0xb;
    *(float *)(local_8 + 0x111) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696aec >> 8);
    local_8[0x15f] = 0xfefe;
    local_8[0x160] = 0xbcfe;
    local_8[0x168] = uVar6;
    local_8[0x165] = 0;
    local_8[0x166] = 0x4040;
    *(undefined1 *)(local_8 + 0x167) = uVar3;
    *(undefined1 *)((int)local_8 + 0x2cf) = uVar5;
    local_8[0x16d] = (ushort)pbVar7[4] - (ushort)*pbVar7;
    local_8[0x16e] = (ushort)pbVar7[9] - (ushort)pbVar7[1];
    *(float *)(local_8 + 0x169) =
         (float)((int)((((uint)pbVar7[4] - (uint)*pbVar7) + 1) * DAT_00696ae8) >> 8);
    *(float *)(local_8 + 0x16b) =
         (float)((int)((((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * DAT_00696aec) >> 8);
    iVar4 = (((uint)pbVar7[4] - (uint)*pbVar7) + 1) * 0xb;
    *(float *)(local_8 + 0x169) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696ae8 >> 8);
    iVar4 = (((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * 0xb;
    *(float *)(local_8 + 0x16b) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696aec >> 8);
    local_8[0x1b9] = 0xfefe;
    local_8[0x1ba] = 0xbcfe;
    local_8[0x1c2] = uVar6;
    local_8[0x1bf] = 0;
    local_8[0x1c0] = 0x4040;
    *(undefined1 *)(local_8 + 0x1c1) = uVar3;
    *(undefined1 *)((int)local_8 + 899) = uVar5;
    local_8[0x1c7] = (ushort)pbVar7[4] - (ushort)*pbVar7;
    local_8[0x1c8] = (ushort)pbVar7[9] - (ushort)pbVar7[1];
    *(float *)(local_8 + 0x1c3) =
         (float)((int)((((uint)pbVar7[4] - (uint)*pbVar7) + 1) * DAT_00696ae8) >> 8);
    *(float *)(local_8 + 0x1c5) =
         (float)((int)((((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * DAT_00696aec) >> 8);
    iVar4 = (((uint)pbVar7[4] - (uint)*pbVar7) + 1) * 0xb;
    *(float *)(local_8 + 0x1c3) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696ae8 >> 8);
    iVar4 = (((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * 0xb;
    *(float *)(local_8 + 0x1c5) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696aec >> 8);
    local_8[0x213] = 0xfefe;
    local_8[0x214] = 0xbcfe;
    local_8[0x21c] = uVar6;
    local_8[0x219] = 0;
    local_8[0x21a] = 0x4040;
    *(undefined1 *)(local_8 + 0x21b) = uVar3;
    *(undefined1 *)((int)local_8 + 0x437) = uVar5;
    local_8[0x221] = (ushort)pbVar7[4] - (ushort)*pbVar7;
    local_8[0x222] = (ushort)pbVar7[9] - (ushort)pbVar7[1];
    *(float *)(local_8 + 0x21d) =
         (float)((int)((((uint)pbVar7[4] - (uint)*pbVar7) + 1) * DAT_00696ae8) >> 8);
    *(float *)(local_8 + 0x21f) =
         (float)((int)((((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * DAT_00696aec) >> 8);
    iVar4 = (((uint)pbVar7[4] - (uint)*pbVar7) + 1) * 0xb;
    *(float *)(local_8 + 0x21d) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696ae8 >> 8);
    iVar4 = (((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * 0xb;
    *(float *)(local_8 + 0x21f) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696aec >> 8);
    local_8[0x26d] = 0xfefe;
    local_8[0x26e] = 0xbcfe;
    local_8[0x276] = uVar6;
    local_8[0x273] = 0;
    local_8[0x274] = 0x4040;
    *(undefined1 *)(local_8 + 0x275) = uVar3;
    *(undefined1 *)((int)local_8 + 0x4eb) = uVar5;
    local_8[0x27b] = (ushort)pbVar7[4] - (ushort)*pbVar7;
    local_8[0x27c] = (ushort)pbVar7[9] - (ushort)pbVar7[1];
    *(float *)(local_8 + 0x277) =
         (float)((int)((((uint)pbVar7[4] - (uint)*pbVar7) + 1) * DAT_00696ae8) >> 8);
    *(float *)(local_8 + 0x279) =
         (float)((int)((((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * DAT_00696aec) >> 8);
    iVar4 = (((uint)pbVar7[4] - (uint)*pbVar7) + 1) * 0xb;
    *(float *)(local_8 + 0x277) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696ae8 >> 8);
    iVar4 = (((uint)pbVar7[9] - (uint)pbVar7[1]) + 1) * 0xb;
    local_10 = local_10 + 1;
    *(float *)(local_8 + 0x279) =
         (float)(((int)(iVar4 + (iVar4 >> 0x1f & 0xfU)) >> 4) * DAT_00696aec >> 8);
    local_8 = local_8 + 0x12;
    local_14 = local_14 + -1;
  } while (local_14 != 0);
  return;
}

