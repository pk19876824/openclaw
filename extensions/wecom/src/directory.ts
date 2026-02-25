import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { getWeComAccessToken } from "./client.js";

/**
 * Get user info from WeCom
 */
export async function getUserInfoWeCom({
  cfg,
  userId,
  accountId,
}: {
  cfg: ClawdbotConfig;
  userId: string;
  accountId?: string;
}): Promise<{
  userid: string;
  name: string;
  department: number[];
  position?: string;
  mobile?: string;
  email?: string;
  avatar?: string;
}> {
  const accessToken = await getWeComAccessToken({ cfg, accountId });
  const url = `https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${accessToken}&userid=${userId}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.errcode !== 0) {
    throw new Error(`Failed to get user info: ${data.errmsg}`);
  }

  return data;
}

/**
 * Get department list from WeCom
 */
export async function getDepartmentListWeCom({
  cfg,
  departmentId,
  accountId,
}: {
  cfg: ClawdbotConfig;
  departmentId?: string;
  accountId?: string;
}): Promise<
  Array<{
    id: number;
    name: string;
    parentid: number;
    order: number;
  }>
> {
  const accessToken = await getWeComAccessToken({ cfg, accountId });
  const url = departmentId
    ? `https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token=${accessToken}&id=${departmentId}`
    : `https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token=${accessToken}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.errcode !== 0) {
    throw new Error(`Failed to get department list: ${data.errmsg}`);
  }

  return data.department ?? [];
}

/**
 * Get department users from WeCom
 */
export async function getDepartmentUsersWeCom({
  cfg,
  departmentId,
  fetchChild,
  accountId,
}: {
  cfg: ClawdbotConfig;
  departmentId: string;
  fetchChild?: boolean;
  accountId?: string;
}): Promise<
  Array<{
    userid: string;
    name: string;
    department: number[];
    position?: string;
    mobile?: string;
    email?: string;
  }>
> {
  const accessToken = await getWeComAccessToken({ cfg, accountId });
  const url = `https://qyapi.weixin.qq.com/cgi-bin/user/simplelist?access_token=${accessToken}&department_id=${departmentId}&fetch_child=${fetchChild ? 1 : 0}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.errcode !== 0) {
    throw new Error(`Failed to get department users: ${data.errmsg}`);
  }

  return data.userlist ?? [];
}
