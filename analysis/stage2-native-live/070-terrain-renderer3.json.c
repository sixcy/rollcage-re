
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_0042cd20(void)

{
  short sVar1;
  short sVar2;
  float fVar3;
  int iVar4;
  int iVar5;
  char cVar6;
  undefined2 *puVar7;
  uint uVar8;
  float *pfVar9;
  int iVar10;
  float *pfVar11;
  float local_23c;
  int local_238;
  int local_234;
  int local_230;
  uint local_22c;
  float local_228;
  undefined1 local_224 [4];
  float local_220;
  float local_21c;
  float local_218;
  float local_20c [129];
  uint local_8;
  
  iVar5 = DAT_00626a8c;
  local_8 = DAT_005122ac ^ (uint)&stack0xfffffffc;
  if (DAT_00626a8c != 0) {
    _DAT_00696224 = DAT_00626a80;
    _DAT_00696228 = DAT_00626a84;
    (*DAT_0069633c)(local_224);
    local_234 = DAT_00626a88;
    (*DAT_00696344)();
    local_230 = ((int)ROUND(local_220) >> 5) + -2;
    local_22c = (int)ROUND(local_220);
    if (0 < local_230) {
      if (((0x100 < local_230) && (local_230 = local_230 / 2 + 0x80, 0x180 < local_230)) &&
         (local_230 = local_230 / 2 + 0xc0, 0x1ff < local_230)) {
        local_230 = 0x1ff;
      }
      iVar4 = local_230;
      iVar10 = iVar5 + 0xf;
      iVar5 = (int)((longlong)(ulonglong)*(ushort *)(&DAT_00626a3e + iVar5 * 2) /
                   (longlong)local_230);
      local_22c = 0x20;
      if (0x1f < iVar10) {
        iVar10 = 0x1f;
      }
      pfVar9 = local_20c + 1;
      local_238 = (int)((longlong)(ulonglong)(ushort)(&DAT_00626a40)[iVar10] / (longlong)local_230);
      uVar8 = 0;
      do {
        sVar1 = (&DAT_00513260)[uVar8 & 0xff];
        sVar2 = (&DAT_00513260)[uVar8 + 0x40 & 0xff];
        pfVar9[-1] = (float)(iVar5 * sVar1 >> 0xe) + local_21c;
        *pfVar9 = (float)(local_238 * sVar1 >> 0xe) + local_21c;
        pfVar9[1] = (float)(iVar5 * sVar2 >> 0xe) + local_218;
        local_228 = (float)(local_238 * sVar2 >> 0xe);
        uVar8 = uVar8 + 8;
        pfVar9[2] = local_228 + local_218;
        pfVar9 = pfVar9 + 4;
        local_22c = local_22c + -1;
      } while (local_22c != 0);
      local_22c = 0;
      if (0x10 < DAT_00626a8c) {
        local_228 = ((float)(0x20 - DAT_00626a8c) / 16.0) * 96.0;
        local_22c = (uint)ROUND(local_228);
      }
      FUN_0042cb70(&local_23c);
      iVar5 = local_234;
      pfVar9 = local_20c + 3;
      local_234 = 6;
      local_22c = 0;
      pfVar11 = (float *)(iVar5 + 0x14);
      do {
        local_228 = (float)(local_22c + 1);
        uVar8 = (uint)local_228 & 0x1f;
        puVar7 = (undefined2 *)
                 (((int)(CONCAT44((int)local_22c >> 0x1f,(int)local_22c >> 1) % 6) +
                  *(ushort *)(DAT_00791594 + 0x2e) + 0x4b) * 0x10 + DAT_00791590);
        pfVar11[-1] = local_20c[uVar8 * 4 + 1];
        *pfVar11 = local_20c[uVar8 * 4 + 3];
        pfVar11[6] = local_20c[uVar8 * 4];
        pfVar11[7] = local_20c[uVar8 * 4 + 2];
        fVar3 = pfVar9[-2];
        pfVar11[-2] = local_220;
        pfVar11[-3] = 8.96831e-44;
        pfVar11[0xd] = fVar3;
        pfVar11[0xe] = *pfVar9;
        fVar3 = pfVar9[-3];
        pfVar11[5] = local_220;
        pfVar11[4] = 8.96831e-44;
        pfVar11[0x14] = fVar3;
        fVar3 = pfVar9[-1];
        pfVar11[0xc] = local_220;
        pfVar11[0xb] = 8.96831e-44;
        pfVar11[0x15] = fVar3;
        pfVar11[0x13] = local_220;
        pfVar11[0x12] = 8.96831e-44;
        *(undefined2 *)(pfVar11 + 3) = *puVar7;
        *(undefined2 *)(pfVar11 + 10) = puVar7[2];
        *(undefined2 *)(pfVar11 + 0x11) = puVar7[4];
        *(undefined2 *)(pfVar11 + 0x18) = puVar7[5];
        cVar6 = (char)((int)((uint)*(byte *)((int)puVar7 + 9) - (uint)*(byte *)((int)puVar7 + 1)) >>
                      1);
        if ((local_22c & 1) == 0) {
          *(char *)((int)pfVar11 + 0x45) = *(char *)((int)pfVar11 + 0x45) - cVar6;
          *(char *)((int)pfVar11 + 0x61) =
               *(char *)((int)pfVar11 + 0x61) -
               (char)((int)((uint)*(byte *)((int)puVar7 + 0xb) - (uint)*(byte *)((int)puVar7 + 5))
                     >> 1);
        }
        else {
          *(char *)((int)pfVar11 + 0xd) = *(char *)((int)pfVar11 + 0xd) + cVar6;
          *(char *)((int)pfVar11 + 0x29) =
               *(char *)((int)pfVar11 + 0x29) +
               (char)((int)((uint)*(byte *)((int)puVar7 + 0xb) - (uint)*(byte *)((int)puVar7 + 5))
                     >> 1);
        }
        pfVar9 = pfVar9 + 4;
        pfVar11[-4] = local_23c;
        *(undefined2 *)((int)pfVar11 + 0x2a) = puVar7[3];
        uVar8 = (&DAT_00790720)[iVar4];
        pfVar11[-5] = *(float *)(uVar8 & 0x7fffffff);
        *(float *)(uVar8 & 0x7fffffff) = (float)(pfVar11 + -5);
        pfVar11 = pfVar11 + 0x1e;
        local_22c = (uint)local_228;
      } while ((int)local_228 < 0x20);
    }
  }
  __security_check_cookie(local_8 ^ (uint)&stack0xfffffffc);
  return;
}

