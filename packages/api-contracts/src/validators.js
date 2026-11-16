// Generated from openapi/root.yaml. DO NOT EDIT.
import formatsModule from "ajv-formats/dist/formats.js";
const formats = formatsModule.fullFormats;
import helper0 from "ajv/dist/runtime/ucs2length.js";
"use strict";
export const schema_Identifier = validate20;
const schema31 = {"$id":"schema_Identifier","type":"string","minLength":1,"description":"Opaque case-sensitive resource identifier; never parse for authority."};
const func1 = helper0.default;

function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_Identifier" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate20.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(typeof data === "string"){
if(func1(data) < 1){
const err0 = {instancePath,schemaPath:"#/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
else {
const err1 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const schema_Timestamp = validate21;
const schema32 = {"$id":"schema_Timestamp","type":"string","format":"date-time"};
const formats0 = formats["date-time"];

function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_Timestamp" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate21.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(typeof data === "string"){
if(!(formats0.validate(data))){
const err0 = {instancePath,schemaPath:"#/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
else {
const err1 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate21.errors = vErrors;
return errors === 0;
}
validate21.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const schema_ListMeta = validate22;
const schema33 = {"$id":"schema_ListMeta","type":"object","additionalProperties":false,"properties":{"total":{"type":"integer","minimum":0}},"required":["total"]};

function validate22(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ListMeta" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate22.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.total === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "total"},message:"must have required property '"+"total"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(key0 === "total")){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.total !== undefined){
let data0 = data.total;
if(!((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0)))){
const err2 = {instancePath:instancePath+"/total",schemaPath:"#/properties/total/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(typeof data0 == "number"){
if(data0 < 0 || isNaN(data0)){
const err3 = {instancePath:instancePath+"/total",schemaPath:"#/properties/total/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
validate22.errors = vErrors;
return errors === 0;
}
validate22.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_LegacyError = validate23;
const schema34 = {"$id":"schema_LegacyError","type":"object","additionalProperties":false,"properties":{"success":{"const":false},"error":{"type":"object","additionalProperties":false,"properties":{"code":{"type":"string"},"message":{"type":"string"},"details":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"field":{"type":"string"},"message":{"type":"string"},"code":{"type":"string"}},"required":["field","message","code"]}}},"required":["code","message"]}},"required":["success","error"]};

function validate23(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_LegacyError" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate23.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.error === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "error"},message:"must have required property '"+"error"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "error"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(false !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: false},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.error !== undefined){
let data1 = data.error;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.code === undefined){
const err4 = {instancePath:instancePath+"/error",schemaPath:"#/properties/error/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.message === undefined){
const err5 = {instancePath:instancePath+"/error",schemaPath:"#/properties/error/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key1 in data1){
if(!(((key1 === "code") || (key1 === "message")) || (key1 === "details"))){
const err6 = {instancePath:instancePath+"/error",schemaPath:"#/properties/error/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data1.code !== undefined){
if(typeof data1.code !== "string"){
const err7 = {instancePath:instancePath+"/error/code",schemaPath:"#/properties/error/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.message !== undefined){
if(typeof data1.message !== "string"){
const err8 = {instancePath:instancePath+"/error/message",schemaPath:"#/properties/error/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data1.details !== undefined){
let data4 = data1.details;
if(Array.isArray(data4)){
const len0 = data4.length;
for(let i0=0; i0<len0; i0++){
let data5 = data4[i0];
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
if(data5.field === undefined){
const err9 = {instancePath:instancePath+"/error/details/" + i0,schemaPath:"#/properties/error/properties/details/items/required",keyword:"required",params:{missingProperty: "field"},message:"must have required property '"+"field"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data5.message === undefined){
const err10 = {instancePath:instancePath+"/error/details/" + i0,schemaPath:"#/properties/error/properties/details/items/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data5.code === undefined){
const err11 = {instancePath:instancePath+"/error/details/" + i0,schemaPath:"#/properties/error/properties/details/items/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
for(const key2 in data5){
if(!(((key2 === "field") || (key2 === "message")) || (key2 === "code"))){
const err12 = {instancePath:instancePath+"/error/details/" + i0,schemaPath:"#/properties/error/properties/details/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data5.field !== undefined){
if(typeof data5.field !== "string"){
const err13 = {instancePath:instancePath+"/error/details/" + i0+"/field",schemaPath:"#/properties/error/properties/details/items/properties/field/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data5.message !== undefined){
if(typeof data5.message !== "string"){
const err14 = {instancePath:instancePath+"/error/details/" + i0+"/message",schemaPath:"#/properties/error/properties/details/items/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data5.code !== undefined){
if(typeof data5.code !== "string"){
const err15 = {instancePath:instancePath+"/error/details/" + i0+"/code",schemaPath:"#/properties/error/properties/details/items/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath:instancePath+"/error/details/" + i0,schemaPath:"#/properties/error/properties/details/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath:instancePath+"/error/details",schemaPath:"#/properties/error/properties/details/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
else {
const err18 = {instancePath:instancePath+"/error",schemaPath:"#/properties/error/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
validate23.errors = vErrors;
return errors === 0;
}
validate23.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_SimpleError = validate24;
const schema35 = {"$id":"schema_SimpleError","type":"object","additionalProperties":false,"properties":{"error":{"type":"string"}},"required":["error"]};

function validate24(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SimpleError" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate24.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.error === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "error"},message:"must have required property '"+"error"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(key0 === "error")){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.error !== undefined){
if(typeof data.error !== "string"){
const err2 = {instancePath:instancePath+"/error",schemaPath:"#/properties/error/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
}
else {
const err3 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
validate24.errors = vErrors;
return errors === 0;
}
validate24.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_Problem = validate25;
const schema36 = {"$id":"schema_Problem","type":"object","additionalProperties":false,"properties":{"type":{"type":"string","format":"uri-reference"},"title":{"type":"string"},"status":{"type":"integer","minimum":400,"maximum":599},"detail":{"type":"string"},"instance":{"type":"string","format":"uri-reference"},"errors":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"field":{"type":"string"},"message":{"type":"string"},"code":{"type":"string"}},"required":["field","message","code"]}}},"required":["type","title","status"]};
const formats2 = /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;

function validate25(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_Problem" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate25.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.type === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.title === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.status === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "type") || (key0 === "title")) || (key0 === "status")) || (key0 === "detail")) || (key0 === "instance")) || (key0 === "errors"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.type !== undefined){
let data0 = data.type;
if(typeof data0 === "string"){
if(!(formats2.test(data0))){
const err4 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/format",keyword:"format",params:{format: "uri-reference"},message:"must match format \""+"uri-reference"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.title !== undefined){
if(typeof data.title !== "string"){
const err6 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.status !== undefined){
let data2 = data.status;
if(!((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2)))){
const err7 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(typeof data2 == "number"){
if(data2 > 599 || isNaN(data2)){
const err8 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/maximum",keyword:"maximum",params:{comparison: "<=", limit: 599},message:"must be <= 599"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data2 < 400 || isNaN(data2)){
const err9 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/minimum",keyword:"minimum",params:{comparison: ">=", limit: 400},message:"must be >= 400"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
if(data.detail !== undefined){
if(typeof data.detail !== "string"){
const err10 = {instancePath:instancePath+"/detail",schemaPath:"#/properties/detail/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.instance !== undefined){
let data4 = data.instance;
if(typeof data4 === "string"){
if(!(formats2.test(data4))){
const err11 = {instancePath:instancePath+"/instance",schemaPath:"#/properties/instance/format",keyword:"format",params:{format: "uri-reference"},message:"must match format \""+"uri-reference"+"\""};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/instance",schemaPath:"#/properties/instance/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.errors !== undefined){
let data5 = data.errors;
if(Array.isArray(data5)){
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
if(data6.field === undefined){
const err13 = {instancePath:instancePath+"/errors/" + i0,schemaPath:"#/properties/errors/items/required",keyword:"required",params:{missingProperty: "field"},message:"must have required property '"+"field"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data6.message === undefined){
const err14 = {instancePath:instancePath+"/errors/" + i0,schemaPath:"#/properties/errors/items/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data6.code === undefined){
const err15 = {instancePath:instancePath+"/errors/" + i0,schemaPath:"#/properties/errors/items/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
for(const key1 in data6){
if(!(((key1 === "field") || (key1 === "message")) || (key1 === "code"))){
const err16 = {instancePath:instancePath+"/errors/" + i0,schemaPath:"#/properties/errors/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data6.field !== undefined){
if(typeof data6.field !== "string"){
const err17 = {instancePath:instancePath+"/errors/" + i0+"/field",schemaPath:"#/properties/errors/items/properties/field/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data6.message !== undefined){
if(typeof data6.message !== "string"){
const err18 = {instancePath:instancePath+"/errors/" + i0+"/message",schemaPath:"#/properties/errors/items/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data6.code !== undefined){
if(typeof data6.code !== "string"){
const err19 = {instancePath:instancePath+"/errors/" + i0+"/code",schemaPath:"#/properties/errors/items/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
}
else {
const err20 = {instancePath:instancePath+"/errors/" + i0,schemaPath:"#/properties/errors/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath:instancePath+"/errors",schemaPath:"#/properties/errors/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
else {
const err22 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
validate25.errors = vErrors;
return errors === 0;
}
validate25.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_User = validate26;
const schema37 = {"$id":"schema_User","type":"object","additionalProperties":false,"properties":{"id":{"$ref":"gamo#/components/schemas/Identifier"},"email":{"type":"string","format":"email"},"displayName":{"anyOf":[{"type":"string"},{"type":"null"}]},"verifiedEmailAt":{"anyOf":[{"$ref":"gamo#/components/schemas/Timestamp"},{"type":"null"}]},"status":{"type":"string"},"createdAt":{"$ref":"gamo#/components/schemas/Timestamp"}},"required":["id","email","displayName","verifiedEmailAt","status","createdAt"]};
const schema39 = {"type":"string","minLength":1,"description":"Opaque case-sensitive resource identifier; never parse for authority."};
const schema40 = {"type":"string","format":"date-time"};
const formats6 = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

function validate26(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_User" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate26.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.email === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "email"},message:"must have required property '"+"email"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.displayName === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.verifiedEmailAt === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "verifiedEmailAt"},message:"must have required property '"+"verifiedEmailAt"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.status === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.createdAt === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "id") || (key0 === "email")) || (key0 === "displayName")) || (key0 === "verifiedEmailAt")) || (key0 === "status")) || (key0 === "createdAt"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err7 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.email !== undefined){
let data1 = data.email;
if(typeof data1 === "string"){
if(!(formats6.test(data1))){
const err9 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.displayName !== undefined){
let data2 = data.displayName;
const _errs8 = errors;
let valid2 = false;
const _errs9 = errors;
if(typeof data2 !== "string"){
const err11 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
var _valid0 = _errs9 === errors;
valid2 = valid2 || _valid0;
const _errs11 = errors;
if(data2 !== null){
const err12 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var _valid0 = _errs11 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err13 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
else {
errors = _errs8;
if(vErrors !== null){
if(_errs8){
vErrors.length = _errs8;
}
else {
vErrors = null;
}
}
}
}
if(data.verifiedEmailAt !== undefined){
let data3 = data.verifiedEmailAt;
const _errs14 = errors;
let valid3 = false;
const _errs15 = errors;
if(typeof data3 === "string"){
if(!(formats0.validate(data3))){
const err14 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid1 = _errs15 === errors;
valid3 = valid3 || _valid1;
const _errs18 = errors;
if(data3 !== null){
const err16 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/properties/verifiedEmailAt/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid1 = _errs18 === errors;
valid3 = valid3 || _valid1;
if(!valid3){
const err17 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/properties/verifiedEmailAt/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
errors = _errs14;
if(vErrors !== null){
if(_errs14){
vErrors.length = _errs14;
}
else {
vErrors = null;
}
}
}
}
if(data.status !== undefined){
if(typeof data.status !== "string"){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data5 = data.createdAt;
if(typeof data5 === "string"){
if(!(formats0.validate(data5))){
const err19 = {instancePath:instancePath+"/createdAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/createdAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
validate26.errors = vErrors;
return errors === 0;
}
validate26.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_SessionInput = validate28;
const schema42 = {"$id":"schema_SessionInput","type":"object","additionalProperties":false,"properties":{"email":{"type":"string","format":"email"},"displayName":{"type":"string"}},"required":["email"]};

function validate28(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SessionInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate28.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.email === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "email"},message:"must have required property '"+"email"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "email") || (key0 === "displayName"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.email !== undefined){
let data0 = data.email;
if(typeof data0 === "string"){
if(!(formats6.test(data0))){
const err2 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
else {
const err3 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.displayName !== undefined){
if(typeof data.displayName !== "string"){
const err4 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
validate28.errors = vErrors;
return errors === 0;
}
validate28.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_SessionResponse = validate29;
const schema43 = {"$id":"schema_SessionResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"user":{"$ref":"gamo#/components/schemas/User"},"sessionId":{"type":"string"},"message":{"type":"string"},"next":{"type":"string","description":"Same-site path to continue at (provider onboarding after a sign-up with a role).","pattern":"^/account/"}},"required":["user","sessionId","message"]}},"required":["success","data"]};
const schema44 = {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/components/schemas/Identifier"},"email":{"type":"string","format":"email"},"displayName":{"anyOf":[{"type":"string"},{"type":"null"}]},"verifiedEmailAt":{"anyOf":[{"$ref":"#/components/schemas/Timestamp"},{"type":"null"}]},"status":{"type":"string"},"createdAt":{"$ref":"#/components/schemas/Timestamp"}},"required":["id","email","displayName","verifiedEmailAt","status","createdAt"]};

function validate30(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate30.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.email === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "email"},message:"must have required property '"+"email"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.displayName === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.verifiedEmailAt === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "verifiedEmailAt"},message:"must have required property '"+"verifiedEmailAt"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.status === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.createdAt === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "id") || (key0 === "email")) || (key0 === "displayName")) || (key0 === "verifiedEmailAt")) || (key0 === "status")) || (key0 === "createdAt"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.email !== undefined){
let data1 = data.email;
if(typeof data1 === "string"){
if(!(formats6.test(data1))){
const err9 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.displayName !== undefined){
let data2 = data.displayName;
const _errs8 = errors;
let valid2 = false;
const _errs9 = errors;
if(typeof data2 !== "string"){
const err11 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
var _valid0 = _errs9 === errors;
valid2 = valid2 || _valid0;
const _errs11 = errors;
if(data2 !== null){
const err12 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var _valid0 = _errs11 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err13 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
else {
errors = _errs8;
if(vErrors !== null){
if(_errs8){
vErrors.length = _errs8;
}
else {
vErrors = null;
}
}
}
}
if(data.verifiedEmailAt !== undefined){
let data3 = data.verifiedEmailAt;
const _errs14 = errors;
let valid3 = false;
const _errs15 = errors;
if(typeof data3 === "string"){
if(!(formats0.validate(data3))){
const err14 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid1 = _errs15 === errors;
valid3 = valid3 || _valid1;
const _errs18 = errors;
if(data3 !== null){
const err16 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/properties/verifiedEmailAt/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid1 = _errs18 === errors;
valid3 = valid3 || _valid1;
if(!valid3){
const err17 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/properties/verifiedEmailAt/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
errors = _errs14;
if(vErrors !== null){
if(_errs14){
vErrors.length = _errs14;
}
else {
vErrors = null;
}
}
}
}
if(data.status !== undefined){
if(typeof data.status !== "string"){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data5 = data.createdAt;
if(typeof data5 === "string"){
if(!(formats0.validate(data5))){
const err19 = {instancePath:instancePath+"/createdAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/createdAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
validate30.errors = vErrors;
return errors === 0;
}
validate30.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const pattern4 = new RegExp("^/account/", "u");

function validate29(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SessionResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate29.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.user === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "user"},message:"must have required property '"+"user"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.sessionId === undefined){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "sessionId"},message:"must have required property '"+"sessionId"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1.message === undefined){
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key1 in data1){
if(!((((key1 === "user") || (key1 === "sessionId")) || (key1 === "message")) || (key1 === "next"))){
const err7 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.user !== undefined){
if(!(validate30(data1.user, {instancePath:instancePath+"/data/user",parentData:data1,parentDataProperty:"user",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
errors = vErrors.length;
}
}
if(data1.sessionId !== undefined){
if(typeof data1.sessionId !== "string"){
const err8 = {instancePath:instancePath+"/data/sessionId",schemaPath:"#/properties/data/properties/sessionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data1.message !== undefined){
if(typeof data1.message !== "string"){
const err9 = {instancePath:instancePath+"/data/message",schemaPath:"#/properties/data/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1.next !== undefined){
let data5 = data1.next;
if(typeof data5 === "string"){
if(!pattern4.test(data5)){
const err10 = {instancePath:instancePath+"/data/next",schemaPath:"#/properties/data/properties/next/pattern",keyword:"pattern",params:{pattern: "^/account/"},message:"must match pattern \""+"^/account/"+"\""};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/data/next",schemaPath:"#/properties/data/properties/next/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
else {
const err12 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
validate29.errors = vErrors;
return errors === 0;
}
validate29.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_LogoutResponse = validate32;
const schema48 = {"$id":"schema_LogoutResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"message":{"type":"string"}},"required":["message"]}},"required":["success","data"]};

function validate32(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_LogoutResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate32.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.message === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(key1 === "message")){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.message !== undefined){
if(typeof data1.message !== "string"){
const err6 = {instancePath:instancePath+"/data/message",schemaPath:"#/properties/data/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
else {
const err8 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
validate32.errors = vErrors;
return errors === 0;
}
validate32.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_AuthChallengeInput = validate33;
const schema49 = {"$id":"schema_AuthChallengeInput","type":"object","additionalProperties":false,"properties":{"email":{"type":"string","format":"email","minLength":3,"maxLength":254},"displayName":{"type":"string","minLength":1,"maxLength":120},"purpose":{"type":"string","enum":["login"],"default":"login"},"intent":{"type":"string","enum":["signin","signup","recover"]},"product":{"type":"string","enum":["web","worship","academy","live","production"]},"role":{"type":"string","description":"Provider role chosen on the sign-up screen (sign-up only; must be one of this product's sign-up roles, otherwise ignored).","enum":["musician","technician","church","agent","organizer","teacher","artist"]},"cf-turnstile-response":{"type":"string","maxLength":4096,"description":"Cloudflare Turnstile token (required outside ENVIRONMENT=local; local accepts the documented dummy token)."}},"required":["email"]};

function validate33(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_AuthChallengeInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate33.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.email === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "email"},message:"must have required property '"+"email"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "email") || (key0 === "displayName")) || (key0 === "purpose")) || (key0 === "intent")) || (key0 === "product")) || (key0 === "role")) || (key0 === "cf-turnstile-response"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.email !== undefined){
let data0 = data.email;
if(typeof data0 === "string"){
if(func1(data0) > 254){
const err2 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/maxLength",keyword:"maxLength",params:{limit: 254},message:"must NOT have more than 254 characters"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(func1(data0) < 3){
const err3 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/minLength",keyword:"minLength",params:{limit: 3},message:"must NOT have fewer than 3 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(formats6.test(data0))){
const err4 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.displayName !== undefined){
let data1 = data.displayName;
if(typeof data1 === "string"){
if(func1(data1) > 120){
const err6 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/maxLength",keyword:"maxLength",params:{limit: 120},message:"must NOT have more than 120 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(func1(data1) < 1){
const err7 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.purpose !== undefined){
let data2 = data.purpose;
if(typeof data2 !== "string"){
const err9 = {instancePath:instancePath+"/purpose",schemaPath:"#/properties/purpose/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(!(data2 === "login")){
const err10 = {instancePath:instancePath+"/purpose",schemaPath:"#/properties/purpose/enum",keyword:"enum",params:{allowedValues: schema49.properties.purpose.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.intent !== undefined){
let data3 = data.intent;
if(typeof data3 !== "string"){
const err11 = {instancePath:instancePath+"/intent",schemaPath:"#/properties/intent/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!(((data3 === "signin") || (data3 === "signup")) || (data3 === "recover"))){
const err12 = {instancePath:instancePath+"/intent",schemaPath:"#/properties/intent/enum",keyword:"enum",params:{allowedValues: schema49.properties.intent.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.product !== undefined){
let data4 = data.product;
if(typeof data4 !== "string"){
const err13 = {instancePath:instancePath+"/product",schemaPath:"#/properties/product/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(!(((((data4 === "web") || (data4 === "worship")) || (data4 === "academy")) || (data4 === "live")) || (data4 === "production"))){
const err14 = {instancePath:instancePath+"/product",schemaPath:"#/properties/product/enum",keyword:"enum",params:{allowedValues: schema49.properties.product.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.role !== undefined){
let data5 = data.role;
if(typeof data5 !== "string"){
const err15 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(!(((((((data5 === "musician") || (data5 === "technician")) || (data5 === "church")) || (data5 === "agent")) || (data5 === "organizer")) || (data5 === "teacher")) || (data5 === "artist"))){
const err16 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/enum",keyword:"enum",params:{allowedValues: schema49.properties.role.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data["cf-turnstile-response"] !== undefined){
let data6 = data["cf-turnstile-response"];
if(typeof data6 === "string"){
if(func1(data6) > 4096){
const err17 = {instancePath:instancePath+"/cf-turnstile-response",schemaPath:"#/properties/cf-turnstile-response/maxLength",keyword:"maxLength",params:{limit: 4096},message:"must NOT have more than 4096 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/cf-turnstile-response",schemaPath:"#/properties/cf-turnstile-response/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
validate33.errors = vErrors;
return errors === 0;
}
validate33.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_AuthChallengeResponse = validate34;
const schema50 = {"$id":"schema_AuthChallengeResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"challengeId":{"$ref":"gamo#/components/schemas/Identifier"},"expiresAt":{"$ref":"gamo#/components/schemas/Timestamp"},"deliveryStatus":{"type":"string","enum":["sent","simulated"]},"message":{"type":"string"}},"required":["challengeId","expiresAt","deliveryStatus","message"]}},"required":["success","data"]};

function validate34(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_AuthChallengeResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate34.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.challengeId === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "challengeId"},message:"must have required property '"+"challengeId"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.expiresAt === undefined){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "expiresAt"},message:"must have required property '"+"expiresAt"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1.deliveryStatus === undefined){
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "deliveryStatus"},message:"must have required property '"+"deliveryStatus"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data1.message === undefined){
const err7 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key1 in data1){
if(!((((key1 === "challengeId") || (key1 === "expiresAt")) || (key1 === "deliveryStatus")) || (key1 === "message"))){
const err8 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data1.challengeId !== undefined){
let data2 = data1.challengeId;
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err9 = {instancePath:instancePath+"/data/challengeId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/data/challengeId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data1.expiresAt !== undefined){
let data3 = data1.expiresAt;
if(typeof data3 === "string"){
if(!(formats0.validate(data3))){
const err11 = {instancePath:instancePath+"/data/expiresAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/data/expiresAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data1.deliveryStatus !== undefined){
let data4 = data1.deliveryStatus;
if(typeof data4 !== "string"){
const err13 = {instancePath:instancePath+"/data/deliveryStatus",schemaPath:"#/properties/data/properties/deliveryStatus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(!((data4 === "sent") || (data4 === "simulated"))){
const err14 = {instancePath:instancePath+"/data/deliveryStatus",schemaPath:"#/properties/data/properties/deliveryStatus/enum",keyword:"enum",params:{allowedValues: schema50.properties.data.properties.deliveryStatus.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data1.message !== undefined){
if(typeof data1.message !== "string"){
const err15 = {instancePath:instancePath+"/data/message",schemaPath:"#/properties/data/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate34.errors = vErrors;
return errors === 0;
}
validate34.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_AuthVerifyInput = validate35;
const schema53 = {"$id":"schema_AuthVerifyInput","type":"object","additionalProperties":false,"properties":{"email":{"type":"string","format":"email","minLength":3,"maxLength":254},"code":{"type":"string","pattern":"^[0-9]{6}$","minLength":6,"maxLength":6},"displayName":{"type":"string","minLength":1,"maxLength":120},"intent":{"type":"string","enum":["signin","signup","recover"]},"product":{"type":"string","enum":["web","worship","academy","live","production"]},"role":{"type":"string","description":"Provider role chosen on the sign-up screen (sign-up only; must be one of this product's sign-up roles, otherwise ignored).","enum":["musician","technician","church","agent","organizer","teacher","artist"]},"terms":{"type":"array","maxItems":10,"description":"Sign-up only — the terms documents the form showed (current Site Terms and Privacy Policy versions are required).","items":{"$ref":"gamo#/components/schemas/TermsDocumentRef"}},"marketingOptIn":{"type":"boolean","description":"Sign-up only — the separate, never pre-ticked marketing checkbox."}},"required":["email","code"]};
const schema54 = {"type":"object","additionalProperties":false,"properties":{"slug":{"type":"string","minLength":2,"maxLength":64},"version":{"type":"string","minLength":1,"maxLength":32}},"required":["slug","version"]};
const pattern5 = new RegExp("^[0-9]{6}$", "u");

function validate35(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_AuthVerifyInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate35.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.email === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "email"},message:"must have required property '"+"email"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.code === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((((((((key0 === "email") || (key0 === "code")) || (key0 === "displayName")) || (key0 === "intent")) || (key0 === "product")) || (key0 === "role")) || (key0 === "terms")) || (key0 === "marketingOptIn"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.email !== undefined){
let data0 = data.email;
if(typeof data0 === "string"){
if(func1(data0) > 254){
const err3 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/maxLength",keyword:"maxLength",params:{limit: 254},message:"must NOT have more than 254 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(func1(data0) < 3){
const err4 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/minLength",keyword:"minLength",params:{limit: 3},message:"must NOT have fewer than 3 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!(formats6.test(data0))){
const err5 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.code !== undefined){
let data1 = data.code;
if(typeof data1 === "string"){
if(func1(data1) > 6){
const err7 = {instancePath:instancePath+"/code",schemaPath:"#/properties/code/maxLength",keyword:"maxLength",params:{limit: 6},message:"must NOT have more than 6 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func1(data1) < 6){
const err8 = {instancePath:instancePath+"/code",schemaPath:"#/properties/code/minLength",keyword:"minLength",params:{limit: 6},message:"must NOT have fewer than 6 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!pattern5.test(data1)){
const err9 = {instancePath:instancePath+"/code",schemaPath:"#/properties/code/pattern",keyword:"pattern",params:{pattern: "^[0-9]{6}$"},message:"must match pattern \""+"^[0-9]{6}$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/code",schemaPath:"#/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.displayName !== undefined){
let data2 = data.displayName;
if(typeof data2 === "string"){
if(func1(data2) > 120){
const err11 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/maxLength",keyword:"maxLength",params:{limit: 120},message:"must NOT have more than 120 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(func1(data2) < 1){
const err12 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.intent !== undefined){
let data3 = data.intent;
if(typeof data3 !== "string"){
const err14 = {instancePath:instancePath+"/intent",schemaPath:"#/properties/intent/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!(((data3 === "signin") || (data3 === "signup")) || (data3 === "recover"))){
const err15 = {instancePath:instancePath+"/intent",schemaPath:"#/properties/intent/enum",keyword:"enum",params:{allowedValues: schema53.properties.intent.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.product !== undefined){
let data4 = data.product;
if(typeof data4 !== "string"){
const err16 = {instancePath:instancePath+"/product",schemaPath:"#/properties/product/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(!(((((data4 === "web") || (data4 === "worship")) || (data4 === "academy")) || (data4 === "live")) || (data4 === "production"))){
const err17 = {instancePath:instancePath+"/product",schemaPath:"#/properties/product/enum",keyword:"enum",params:{allowedValues: schema53.properties.product.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.role !== undefined){
let data5 = data.role;
if(typeof data5 !== "string"){
const err18 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(!(((((((data5 === "musician") || (data5 === "technician")) || (data5 === "church")) || (data5 === "agent")) || (data5 === "organizer")) || (data5 === "teacher")) || (data5 === "artist"))){
const err19 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/enum",keyword:"enum",params:{allowedValues: schema53.properties.role.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.terms !== undefined){
let data6 = data.terms;
if(Array.isArray(data6)){
if(data6.length > 10){
const err20 = {instancePath:instancePath+"/terms",schemaPath:"#/properties/terms/maxItems",keyword:"maxItems",params:{limit: 10},message:"must NOT have more than 10 items"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
const len0 = data6.length;
for(let i0=0; i0<len0; i0++){
let data7 = data6[i0];
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
if(data7.slug === undefined){
const err21 = {instancePath:instancePath+"/terms/" + i0,schemaPath:"gamo#/components/schemas/TermsDocumentRef/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data7.version === undefined){
const err22 = {instancePath:instancePath+"/terms/" + i0,schemaPath:"gamo#/components/schemas/TermsDocumentRef/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
for(const key1 in data7){
if(!((key1 === "slug") || (key1 === "version"))){
const err23 = {instancePath:instancePath+"/terms/" + i0,schemaPath:"gamo#/components/schemas/TermsDocumentRef/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data7.slug !== undefined){
let data8 = data7.slug;
if(typeof data8 === "string"){
if(func1(data8) > 64){
const err24 = {instancePath:instancePath+"/terms/" + i0+"/slug",schemaPath:"gamo#/components/schemas/TermsDocumentRef/properties/slug/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(func1(data8) < 2){
const err25 = {instancePath:instancePath+"/terms/" + i0+"/slug",schemaPath:"gamo#/components/schemas/TermsDocumentRef/properties/slug/minLength",keyword:"minLength",params:{limit: 2},message:"must NOT have fewer than 2 characters"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
else {
const err26 = {instancePath:instancePath+"/terms/" + i0+"/slug",schemaPath:"gamo#/components/schemas/TermsDocumentRef/properties/slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data7.version !== undefined){
let data9 = data7.version;
if(typeof data9 === "string"){
if(func1(data9) > 32){
const err27 = {instancePath:instancePath+"/terms/" + i0+"/version",schemaPath:"gamo#/components/schemas/TermsDocumentRef/properties/version/maxLength",keyword:"maxLength",params:{limit: 32},message:"must NOT have more than 32 characters"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(func1(data9) < 1){
const err28 = {instancePath:instancePath+"/terms/" + i0+"/version",schemaPath:"gamo#/components/schemas/TermsDocumentRef/properties/version/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
else {
const err29 = {instancePath:instancePath+"/terms/" + i0+"/version",schemaPath:"gamo#/components/schemas/TermsDocumentRef/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
}
else {
const err30 = {instancePath:instancePath+"/terms/" + i0,schemaPath:"gamo#/components/schemas/TermsDocumentRef/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
}
else {
const err31 = {instancePath:instancePath+"/terms",schemaPath:"#/properties/terms/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.marketingOptIn !== undefined){
if(typeof data.marketingOptIn !== "boolean"){
const err32 = {instancePath:instancePath+"/marketingOptIn",schemaPath:"#/properties/marketingOptIn/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
}
else {
const err33 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
validate35.errors = vErrors;
return errors === 0;
}
validate35.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_OrganizationMembershipSummary = validate36;
const schema55 = {"$id":"schema_OrganizationMembershipSummary","type":"object","additionalProperties":false,"properties":{"organizationId":{"$ref":"gamo#/components/schemas/Identifier"},"organizationName":{"type":"string"},"organizationSlug":{"type":"string"},"organizationType":{"type":"string","enum":["church","ministry","school","sponsor","other"]},"role":{"type":"string","enum":["owner","admin","coordinator","member"]},"status":{"type":"string"}},"required":["organizationId","organizationName","organizationSlug","organizationType","role","status"]};

function validate36(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_OrganizationMembershipSummary" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate36.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.organizationId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "organizationId"},message:"must have required property '"+"organizationId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.organizationName === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "organizationName"},message:"must have required property '"+"organizationName"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.organizationSlug === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "organizationSlug"},message:"must have required property '"+"organizationSlug"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.organizationType === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "organizationType"},message:"must have required property '"+"organizationType"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.role === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "role"},message:"must have required property '"+"role"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "organizationId") || (key0 === "organizationName")) || (key0 === "organizationSlug")) || (key0 === "organizationType")) || (key0 === "role")) || (key0 === "status"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.organizationId !== undefined){
let data0 = data.organizationId;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err7 = {instancePath:instancePath+"/organizationId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/organizationId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.organizationName !== undefined){
if(typeof data.organizationName !== "string"){
const err9 = {instancePath:instancePath+"/organizationName",schemaPath:"#/properties/organizationName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.organizationSlug !== undefined){
if(typeof data.organizationSlug !== "string"){
const err10 = {instancePath:instancePath+"/organizationSlug",schemaPath:"#/properties/organizationSlug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.organizationType !== undefined){
let data3 = data.organizationType;
if(typeof data3 !== "string"){
const err11 = {instancePath:instancePath+"/organizationType",schemaPath:"#/properties/organizationType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!(((((data3 === "church") || (data3 === "ministry")) || (data3 === "school")) || (data3 === "sponsor")) || (data3 === "other"))){
const err12 = {instancePath:instancePath+"/organizationType",schemaPath:"#/properties/organizationType/enum",keyword:"enum",params:{allowedValues: schema55.properties.organizationType.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.role !== undefined){
let data4 = data.role;
if(typeof data4 !== "string"){
const err13 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(!((((data4 === "owner") || (data4 === "admin")) || (data4 === "coordinator")) || (data4 === "member"))){
const err14 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/enum",keyword:"enum",params:{allowedValues: schema55.properties.role.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.status !== undefined){
if(typeof data.status !== "string"){
const err15 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate36.errors = vErrors;
return errors === 0;
}
validate36.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_AuthMeResponse = validate37;
const schema57 = {"$id":"schema_AuthMeResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"user":{"$ref":"gamo#/components/schemas/User"},"sessionId":{"type":"string"},"roles":{"type":"array","items":{"type":"string"}},"memberships":{"type":"array","items":{"$ref":"gamo#/components/schemas/OrganizationMembershipSummary"}},"products":{"type":"array","items":{"type":"string"}},"product":{"type":["string","null"]}},"required":["user","sessionId","roles","memberships"]}},"required":["success","data"]};

function validate38(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate38.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.email === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "email"},message:"must have required property '"+"email"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.displayName === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.verifiedEmailAt === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "verifiedEmailAt"},message:"must have required property '"+"verifiedEmailAt"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.status === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.createdAt === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "id") || (key0 === "email")) || (key0 === "displayName")) || (key0 === "verifiedEmailAt")) || (key0 === "status")) || (key0 === "createdAt"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.email !== undefined){
let data1 = data.email;
if(typeof data1 === "string"){
if(!(formats6.test(data1))){
const err9 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.displayName !== undefined){
let data2 = data.displayName;
const _errs8 = errors;
let valid2 = false;
const _errs9 = errors;
if(typeof data2 !== "string"){
const err11 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
var _valid0 = _errs9 === errors;
valid2 = valid2 || _valid0;
const _errs11 = errors;
if(data2 !== null){
const err12 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var _valid0 = _errs11 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err13 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
else {
errors = _errs8;
if(vErrors !== null){
if(_errs8){
vErrors.length = _errs8;
}
else {
vErrors = null;
}
}
}
}
if(data.verifiedEmailAt !== undefined){
let data3 = data.verifiedEmailAt;
const _errs14 = errors;
let valid3 = false;
const _errs15 = errors;
if(typeof data3 === "string"){
if(!(formats0.validate(data3))){
const err14 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid1 = _errs15 === errors;
valid3 = valid3 || _valid1;
const _errs18 = errors;
if(data3 !== null){
const err16 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/properties/verifiedEmailAt/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid1 = _errs18 === errors;
valid3 = valid3 || _valid1;
if(!valid3){
const err17 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/properties/verifiedEmailAt/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
errors = _errs14;
if(vErrors !== null){
if(_errs14){
vErrors.length = _errs14;
}
else {
vErrors = null;
}
}
}
}
if(data.status !== undefined){
if(typeof data.status !== "string"){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data5 = data.createdAt;
if(typeof data5 === "string"){
if(!(formats0.validate(data5))){
const err19 = {instancePath:instancePath+"/createdAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/createdAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
validate38.errors = vErrors;
return errors === 0;
}
validate38.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema62 = {"type":"object","additionalProperties":false,"properties":{"organizationId":{"$ref":"#/components/schemas/Identifier"},"organizationName":{"type":"string"},"organizationSlug":{"type":"string"},"organizationType":{"type":"string","enum":["church","ministry","school","sponsor","other"]},"role":{"type":"string","enum":["owner","admin","coordinator","member"]},"status":{"type":"string"}},"required":["organizationId","organizationName","organizationSlug","organizationType","role","status"]};

function validate40(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate40.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.organizationId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "organizationId"},message:"must have required property '"+"organizationId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.organizationName === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "organizationName"},message:"must have required property '"+"organizationName"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.organizationSlug === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "organizationSlug"},message:"must have required property '"+"organizationSlug"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.organizationType === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "organizationType"},message:"must have required property '"+"organizationType"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.role === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "role"},message:"must have required property '"+"role"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "organizationId") || (key0 === "organizationName")) || (key0 === "organizationSlug")) || (key0 === "organizationType")) || (key0 === "role")) || (key0 === "status"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.organizationId !== undefined){
let data0 = data.organizationId;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err7 = {instancePath:instancePath+"/organizationId",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/organizationId",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.organizationName !== undefined){
if(typeof data.organizationName !== "string"){
const err9 = {instancePath:instancePath+"/organizationName",schemaPath:"#/properties/organizationName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.organizationSlug !== undefined){
if(typeof data.organizationSlug !== "string"){
const err10 = {instancePath:instancePath+"/organizationSlug",schemaPath:"#/properties/organizationSlug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.organizationType !== undefined){
let data3 = data.organizationType;
if(typeof data3 !== "string"){
const err11 = {instancePath:instancePath+"/organizationType",schemaPath:"#/properties/organizationType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!(((((data3 === "church") || (data3 === "ministry")) || (data3 === "school")) || (data3 === "sponsor")) || (data3 === "other"))){
const err12 = {instancePath:instancePath+"/organizationType",schemaPath:"#/properties/organizationType/enum",keyword:"enum",params:{allowedValues: schema62.properties.organizationType.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.role !== undefined){
let data4 = data.role;
if(typeof data4 !== "string"){
const err13 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(!((((data4 === "owner") || (data4 === "admin")) || (data4 === "coordinator")) || (data4 === "member"))){
const err14 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/enum",keyword:"enum",params:{allowedValues: schema62.properties.role.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.status !== undefined){
if(typeof data.status !== "string"){
const err15 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate40.errors = vErrors;
return errors === 0;
}
validate40.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate37(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_AuthMeResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate37.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.user === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "user"},message:"must have required property '"+"user"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.sessionId === undefined){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "sessionId"},message:"must have required property '"+"sessionId"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1.roles === undefined){
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "roles"},message:"must have required property '"+"roles"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data1.memberships === undefined){
const err7 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "memberships"},message:"must have required property '"+"memberships"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key1 in data1){
if(!((((((key1 === "user") || (key1 === "sessionId")) || (key1 === "roles")) || (key1 === "memberships")) || (key1 === "products")) || (key1 === "product"))){
const err8 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data1.user !== undefined){
if(!(validate38(data1.user, {instancePath:instancePath+"/data/user",parentData:data1,parentDataProperty:"user",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
errors = vErrors.length;
}
}
if(data1.sessionId !== undefined){
if(typeof data1.sessionId !== "string"){
const err9 = {instancePath:instancePath+"/data/sessionId",schemaPath:"#/properties/data/properties/sessionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1.roles !== undefined){
let data4 = data1.roles;
if(Array.isArray(data4)){
const len0 = data4.length;
for(let i0=0; i0<len0; i0++){
if(typeof data4[i0] !== "string"){
const err10 = {instancePath:instancePath+"/data/roles/" + i0,schemaPath:"#/properties/data/properties/roles/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath:instancePath+"/data/roles",schemaPath:"#/properties/data/properties/roles/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data1.memberships !== undefined){
let data6 = data1.memberships;
if(Array.isArray(data6)){
const len1 = data6.length;
for(let i1=0; i1<len1; i1++){
if(!(validate40(data6[i1], {instancePath:instancePath+"/data/memberships/" + i1,parentData:data6,parentDataProperty:i1,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
errors = vErrors.length;
}
}
}
else {
const err12 = {instancePath:instancePath+"/data/memberships",schemaPath:"#/properties/data/properties/memberships/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data1.products !== undefined){
let data8 = data1.products;
if(Array.isArray(data8)){
const len2 = data8.length;
for(let i2=0; i2<len2; i2++){
if(typeof data8[i2] !== "string"){
const err13 = {instancePath:instancePath+"/data/products/" + i2,schemaPath:"#/properties/data/properties/products/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath:instancePath+"/data/products",schemaPath:"#/properties/data/properties/products/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data1.product !== undefined){
let data10 = data1.product;
if((typeof data10 !== "string") && (data10 !== null)){
const err15 = {instancePath:instancePath+"/data/product",schemaPath:"#/properties/data/properties/product/type",keyword:"type",params:{type: schema57.properties.data.properties.product.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate37.errors = vErrors;
return errors === 0;
}
validate37.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_Organization = validate42;
const schema64 = {"$id":"schema_Organization","type":"object","additionalProperties":false,"properties":{"id":{"$ref":"gamo#/components/schemas/Identifier"},"name":{"type":"string"},"slug":{"type":"string"},"type":{"type":"string","enum":["church","ministry","school","sponsor","other"]},"verifiedAt":{"anyOf":[{"$ref":"gamo#/components/schemas/Timestamp"},{"type":"null"}]},"status":{"type":"string"},"createdAt":{"$ref":"gamo#/components/schemas/Timestamp"}},"required":["id","name","slug","type","verifiedAt","status","createdAt"]};

function validate42(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_Organization" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate42.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.name === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.slug === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.type === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.verifiedAt === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "verifiedAt"},message:"must have required property '"+"verifiedAt"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.createdAt === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "id") || (key0 === "name")) || (key0 === "slug")) || (key0 === "type")) || (key0 === "verifiedAt")) || (key0 === "status")) || (key0 === "createdAt"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err8 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.name !== undefined){
if(typeof data.name !== "string"){
const err10 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.slug !== undefined){
if(typeof data.slug !== "string"){
const err11 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.type !== undefined){
let data3 = data.type;
if(typeof data3 !== "string"){
const err12 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!(((((data3 === "church") || (data3 === "ministry")) || (data3 === "school")) || (data3 === "sponsor")) || (data3 === "other"))){
const err13 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/enum",keyword:"enum",params:{allowedValues: schema64.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.verifiedAt !== undefined){
let data4 = data.verifiedAt;
const _errs12 = errors;
let valid2 = false;
const _errs13 = errors;
if(typeof data4 === "string"){
if(!(formats0.validate(data4))){
const err14 = {instancePath:instancePath+"/verifiedAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/verifiedAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid0 = _errs13 === errors;
valid2 = valid2 || _valid0;
const _errs16 = errors;
if(data4 !== null){
const err16 = {instancePath:instancePath+"/verifiedAt",schemaPath:"#/properties/verifiedAt/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid0 = _errs16 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err17 = {instancePath:instancePath+"/verifiedAt",schemaPath:"#/properties/verifiedAt/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
errors = _errs12;
if(vErrors !== null){
if(_errs12){
vErrors.length = _errs12;
}
else {
vErrors = null;
}
}
}
}
if(data.status !== undefined){
if(typeof data.status !== "string"){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data6 = data.createdAt;
if(typeof data6 === "string"){
if(!(formats0.validate(data6))){
const err19 = {instancePath:instancePath+"/createdAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/createdAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
validate42.errors = vErrors;
return errors === 0;
}
validate42.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_CreateOrganizationInput = validate43;
const schema68 = {"$id":"schema_CreateOrganizationInput","type":"object","additionalProperties":false,"properties":{"name":{"type":"string","minLength":2,"maxLength":160},"slug":{"type":"string","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":2,"maxLength":80},"type":{"type":"string","enum":["church","ministry","school","sponsor","other"]}},"required":["name","slug","type"]};
const pattern6 = new RegExp("^[a-z0-9]+(?:-[a-z0-9]+)*$", "u");

function validate43(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_CreateOrganizationInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate43.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.name === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.slug === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.type === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "name") || (key0 === "slug")) || (key0 === "type"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.name !== undefined){
let data0 = data.name;
if(typeof data0 === "string"){
if(func1(data0) > 160){
const err4 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 160},message:"must NOT have more than 160 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func1(data0) < 2){
const err5 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/minLength",keyword:"minLength",params:{limit: 2},message:"must NOT have fewer than 2 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.slug !== undefined){
let data1 = data.slug;
if(typeof data1 === "string"){
if(func1(data1) > 80){
const err7 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/maxLength",keyword:"maxLength",params:{limit: 80},message:"must NOT have more than 80 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func1(data1) < 2){
const err8 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/minLength",keyword:"minLength",params:{limit: 2},message:"must NOT have fewer than 2 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!pattern6.test(data1)){
const err9 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.type !== undefined){
let data2 = data.type;
if(typeof data2 !== "string"){
const err11 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!(((((data2 === "church") || (data2 === "ministry")) || (data2 === "school")) || (data2 === "sponsor")) || (data2 === "other"))){
const err12 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/enum",keyword:"enum",params:{allowedValues: schema68.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
validate43.errors = vErrors;
return errors === 0;
}
validate43.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_CreateOrganizationResponse = validate44;
const schema69 = {"$id":"schema_CreateOrganizationResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"organization":{"$ref":"gamo#/components/schemas/Organization"},"membershipRole":{"type":"string","const":"owner"},"message":{"type":"string"}},"required":["organization","membershipRole","message"]}},"required":["success","data"]};
const schema70 = {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/components/schemas/Identifier"},"name":{"type":"string"},"slug":{"type":"string"},"type":{"type":"string","enum":["church","ministry","school","sponsor","other"]},"verifiedAt":{"anyOf":[{"$ref":"#/components/schemas/Timestamp"},{"type":"null"}]},"status":{"type":"string"},"createdAt":{"$ref":"#/components/schemas/Timestamp"}},"required":["id","name","slug","type","verifiedAt","status","createdAt"]};

function validate45(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate45.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.name === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.slug === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.type === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.verifiedAt === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "verifiedAt"},message:"must have required property '"+"verifiedAt"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.createdAt === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "id") || (key0 === "name")) || (key0 === "slug")) || (key0 === "type")) || (key0 === "verifiedAt")) || (key0 === "status")) || (key0 === "createdAt"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.name !== undefined){
if(typeof data.name !== "string"){
const err10 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.slug !== undefined){
if(typeof data.slug !== "string"){
const err11 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.type !== undefined){
let data3 = data.type;
if(typeof data3 !== "string"){
const err12 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!(((((data3 === "church") || (data3 === "ministry")) || (data3 === "school")) || (data3 === "sponsor")) || (data3 === "other"))){
const err13 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/enum",keyword:"enum",params:{allowedValues: schema70.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.verifiedAt !== undefined){
let data4 = data.verifiedAt;
const _errs12 = errors;
let valid2 = false;
const _errs13 = errors;
if(typeof data4 === "string"){
if(!(formats0.validate(data4))){
const err14 = {instancePath:instancePath+"/verifiedAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/verifiedAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid0 = _errs13 === errors;
valid2 = valid2 || _valid0;
const _errs16 = errors;
if(data4 !== null){
const err16 = {instancePath:instancePath+"/verifiedAt",schemaPath:"#/properties/verifiedAt/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid0 = _errs16 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err17 = {instancePath:instancePath+"/verifiedAt",schemaPath:"#/properties/verifiedAt/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
errors = _errs12;
if(vErrors !== null){
if(_errs12){
vErrors.length = _errs12;
}
else {
vErrors = null;
}
}
}
}
if(data.status !== undefined){
if(typeof data.status !== "string"){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data6 = data.createdAt;
if(typeof data6 === "string"){
if(!(formats0.validate(data6))){
const err19 = {instancePath:instancePath+"/createdAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/createdAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
validate45.errors = vErrors;
return errors === 0;
}
validate45.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate44(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_CreateOrganizationResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate44.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.organization === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "organization"},message:"must have required property '"+"organization"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.membershipRole === undefined){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "membershipRole"},message:"must have required property '"+"membershipRole"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1.message === undefined){
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key1 in data1){
if(!(((key1 === "organization") || (key1 === "membershipRole")) || (key1 === "message"))){
const err7 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.organization !== undefined){
if(!(validate45(data1.organization, {instancePath:instancePath+"/data/organization",parentData:data1,parentDataProperty:"organization",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate45.errors : vErrors.concat(validate45.errors);
errors = vErrors.length;
}
}
if(data1.membershipRole !== undefined){
let data3 = data1.membershipRole;
if(typeof data3 !== "string"){
const err8 = {instancePath:instancePath+"/data/membershipRole",schemaPath:"#/properties/data/properties/membershipRole/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if("owner" !== data3){
const err9 = {instancePath:instancePath+"/data/membershipRole",schemaPath:"#/properties/data/properties/membershipRole/const",keyword:"const",params:{allowedValue: "owner"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1.message !== undefined){
if(typeof data1.message !== "string"){
const err10 = {instancePath:instancePath+"/data/message",schemaPath:"#/properties/data/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
else {
const err12 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
validate44.errors = vErrors;
return errors === 0;
}
validate44.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ProvisionStaffInput = validate47;
const schema74 = {"$id":"schema_ProvisionStaffInput","type":"object","additionalProperties":false,"properties":{"email":{"type":"string","format":"email","minLength":3,"maxLength":254},"role":{"type":"string","enum":["staff_reviewer","finance_manager","superadmin"]},"accessSubject":{"type":"string","minLength":1,"maxLength":255},"displayName":{"type":"string","minLength":1,"maxLength":120}},"required":["email","role","accessSubject"]};

function validate47(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ProvisionStaffInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate47.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.email === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "email"},message:"must have required property '"+"email"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.role === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "role"},message:"must have required property '"+"role"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.accessSubject === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "accessSubject"},message:"must have required property '"+"accessSubject"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "email") || (key0 === "role")) || (key0 === "accessSubject")) || (key0 === "displayName"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.email !== undefined){
let data0 = data.email;
if(typeof data0 === "string"){
if(func1(data0) > 254){
const err4 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/maxLength",keyword:"maxLength",params:{limit: 254},message:"must NOT have more than 254 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func1(data0) < 3){
const err5 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/minLength",keyword:"minLength",params:{limit: 3},message:"must NOT have fewer than 3 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!(formats6.test(data0))){
const err6 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.role !== undefined){
let data1 = data.role;
if(typeof data1 !== "string"){
const err8 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!(((data1 === "staff_reviewer") || (data1 === "finance_manager")) || (data1 === "superadmin"))){
const err9 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/enum",keyword:"enum",params:{allowedValues: schema74.properties.role.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.accessSubject !== undefined){
let data2 = data.accessSubject;
if(typeof data2 === "string"){
if(func1(data2) > 255){
const err10 = {instancePath:instancePath+"/accessSubject",schemaPath:"#/properties/accessSubject/maxLength",keyword:"maxLength",params:{limit: 255},message:"must NOT have more than 255 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func1(data2) < 1){
const err11 = {instancePath:instancePath+"/accessSubject",schemaPath:"#/properties/accessSubject/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/accessSubject",schemaPath:"#/properties/accessSubject/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.displayName !== undefined){
let data3 = data.displayName;
if(typeof data3 === "string"){
if(func1(data3) > 120){
const err13 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/maxLength",keyword:"maxLength",params:{limit: 120},message:"must NOT have more than 120 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(func1(data3) < 1){
const err14 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate47.errors = vErrors;
return errors === 0;
}
validate47.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ProvisionStaffResponse = validate48;
const schema75 = {"$id":"schema_ProvisionStaffResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"user":{"$ref":"gamo#/components/schemas/User"},"role":{"type":"string","enum":["staff_reviewer","finance_manager","superadmin"]},"provider":{"type":"string","const":"cloudflare_access"},"accessSubject":{"type":"string"},"message":{"type":"string"}},"required":["user","role","provider","accessSubject","message"]}},"required":["success","data"]};

function validate49(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate49.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.email === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "email"},message:"must have required property '"+"email"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.displayName === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.verifiedEmailAt === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "verifiedEmailAt"},message:"must have required property '"+"verifiedEmailAt"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.status === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.createdAt === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "id") || (key0 === "email")) || (key0 === "displayName")) || (key0 === "verifiedEmailAt")) || (key0 === "status")) || (key0 === "createdAt"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.email !== undefined){
let data1 = data.email;
if(typeof data1 === "string"){
if(!(formats6.test(data1))){
const err9 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.displayName !== undefined){
let data2 = data.displayName;
const _errs8 = errors;
let valid2 = false;
const _errs9 = errors;
if(typeof data2 !== "string"){
const err11 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
var _valid0 = _errs9 === errors;
valid2 = valid2 || _valid0;
const _errs11 = errors;
if(data2 !== null){
const err12 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var _valid0 = _errs11 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err13 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
else {
errors = _errs8;
if(vErrors !== null){
if(_errs8){
vErrors.length = _errs8;
}
else {
vErrors = null;
}
}
}
}
if(data.verifiedEmailAt !== undefined){
let data3 = data.verifiedEmailAt;
const _errs14 = errors;
let valid3 = false;
const _errs15 = errors;
if(typeof data3 === "string"){
if(!(formats0.validate(data3))){
const err14 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid1 = _errs15 === errors;
valid3 = valid3 || _valid1;
const _errs18 = errors;
if(data3 !== null){
const err16 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/properties/verifiedEmailAt/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid1 = _errs18 === errors;
valid3 = valid3 || _valid1;
if(!valid3){
const err17 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/properties/verifiedEmailAt/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
errors = _errs14;
if(vErrors !== null){
if(_errs14){
vErrors.length = _errs14;
}
else {
vErrors = null;
}
}
}
}
if(data.status !== undefined){
if(typeof data.status !== "string"){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data5 = data.createdAt;
if(typeof data5 === "string"){
if(!(formats0.validate(data5))){
const err19 = {instancePath:instancePath+"/createdAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/createdAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
validate49.errors = vErrors;
return errors === 0;
}
validate49.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate48(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ProvisionStaffResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate48.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.user === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "user"},message:"must have required property '"+"user"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.role === undefined){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "role"},message:"must have required property '"+"role"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1.provider === undefined){
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "provider"},message:"must have required property '"+"provider"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data1.accessSubject === undefined){
const err7 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "accessSubject"},message:"must have required property '"+"accessSubject"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data1.message === undefined){
const err8 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key1 in data1){
if(!(((((key1 === "user") || (key1 === "role")) || (key1 === "provider")) || (key1 === "accessSubject")) || (key1 === "message"))){
const err9 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1.user !== undefined){
if(!(validate49(data1.user, {instancePath:instancePath+"/data/user",parentData:data1,parentDataProperty:"user",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate49.errors : vErrors.concat(validate49.errors);
errors = vErrors.length;
}
}
if(data1.role !== undefined){
let data3 = data1.role;
if(typeof data3 !== "string"){
const err10 = {instancePath:instancePath+"/data/role",schemaPath:"#/properties/data/properties/role/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(!(((data3 === "staff_reviewer") || (data3 === "finance_manager")) || (data3 === "superadmin"))){
const err11 = {instancePath:instancePath+"/data/role",schemaPath:"#/properties/data/properties/role/enum",keyword:"enum",params:{allowedValues: schema75.properties.data.properties.role.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data1.provider !== undefined){
let data4 = data1.provider;
if(typeof data4 !== "string"){
const err12 = {instancePath:instancePath+"/data/provider",schemaPath:"#/properties/data/properties/provider/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if("cloudflare_access" !== data4){
const err13 = {instancePath:instancePath+"/data/provider",schemaPath:"#/properties/data/properties/provider/const",keyword:"const",params:{allowedValue: "cloudflare_access"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data1.accessSubject !== undefined){
if(typeof data1.accessSubject !== "string"){
const err14 = {instancePath:instancePath+"/data/accessSubject",schemaPath:"#/properties/data/properties/accessSubject/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data1.message !== undefined){
if(typeof data1.message !== "string"){
const err15 = {instancePath:instancePath+"/data/message",schemaPath:"#/properties/data/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate48.errors = vErrors;
return errors === 0;
}
validate48.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ParticipationInput = validate51;
const schema80 = {"$id":"schema_ParticipationInput","type":"object","additionalProperties":false,"required":["kind","interest","name","message"],"properties":{"kind":{"type":"string","enum":["general","partnership"]},"interest":{"type":"string","minLength":2,"maxLength":80},"name":{"type":"string","minLength":2,"maxLength":120},"organization":{"type":"string","minLength":0,"maxLength":160},"message":{"type":"string","minLength":10,"maxLength":4000}}};

function validate51(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ParticipationInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate51.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.interest === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "interest"},message:"must have required property '"+"interest"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.name === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.message === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "kind") || (key0 === "interest")) || (key0 === "name")) || (key0 === "organization")) || (key0 === "message"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err5 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!((data0 === "general") || (data0 === "partnership"))){
const err6 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/enum",keyword:"enum",params:{allowedValues: schema80.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.interest !== undefined){
let data1 = data.interest;
if(typeof data1 === "string"){
if(func1(data1) > 80){
const err7 = {instancePath:instancePath+"/interest",schemaPath:"#/properties/interest/maxLength",keyword:"maxLength",params:{limit: 80},message:"must NOT have more than 80 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func1(data1) < 2){
const err8 = {instancePath:instancePath+"/interest",schemaPath:"#/properties/interest/minLength",keyword:"minLength",params:{limit: 2},message:"must NOT have fewer than 2 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/interest",schemaPath:"#/properties/interest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.name !== undefined){
let data2 = data.name;
if(typeof data2 === "string"){
if(func1(data2) > 120){
const err10 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 120},message:"must NOT have more than 120 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func1(data2) < 2){
const err11 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/minLength",keyword:"minLength",params:{limit: 2},message:"must NOT have fewer than 2 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.organization !== undefined){
let data3 = data.organization;
if(typeof data3 === "string"){
if(func1(data3) > 160){
const err13 = {instancePath:instancePath+"/organization",schemaPath:"#/properties/organization/maxLength",keyword:"maxLength",params:{limit: 160},message:"must NOT have more than 160 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(func1(data3) < 0){
const err14 = {instancePath:instancePath+"/organization",schemaPath:"#/properties/organization/minLength",keyword:"minLength",params:{limit: 0},message:"must NOT have fewer than 0 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/organization",schemaPath:"#/properties/organization/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.message !== undefined){
let data4 = data.message;
if(typeof data4 === "string"){
if(func1(data4) > 4000){
const err16 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/maxLength",keyword:"maxLength",params:{limit: 4000},message:"must NOT have more than 4000 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(func1(data4) < 10){
const err17 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/minLength",keyword:"minLength",params:{limit: 10},message:"must NOT have fewer than 10 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
validate51.errors = vErrors;
return errors === 0;
}
validate51.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ParticipationReviewInput = validate52;
const schema81 = {"$id":"schema_ParticipationReviewInput","type":"object","additionalProperties":false,"required":["status","notes"],"properties":{"status":{"type":"string","enum":["reviewed","closed"]},"notes":{"type":"string","minLength":1,"maxLength":2000}}};

function validate52(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ParticipationReviewInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate52.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.status === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.notes === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "notes"},message:"must have required property '"+"notes"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "status") || (key0 === "notes"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.status !== undefined){
let data0 = data.status;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!((data0 === "reviewed") || (data0 === "closed"))){
const err4 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema81.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.notes !== undefined){
let data1 = data.notes;
if(typeof data1 === "string"){
if(func1(data1) > 2000){
const err5 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func1(data1) < 1){
const err6 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
else {
const err8 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
validate52.errors = vErrors;
return errors === 0;
}
validate52.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ParticipationInquiry = validate53;
const schema82 = {"$id":"schema_ParticipationInquiry","type":"object","additionalProperties":false,"required":["id","userId","kind","interest","name","organization","message","status","reviewNotes","createdAt","reviewedAt"],"properties":{"id":{"type":"string"},"userId":{"type":"string"},"kind":{"type":"string","enum":["general","partnership"]},"interest":{"type":"string","minLength":2,"maxLength":80},"name":{"type":"string","minLength":2,"maxLength":120},"organization":{"type":["string","null"]},"message":{"type":"string","minLength":10,"maxLength":4000},"status":{"type":"string","enum":["pending","reviewed","closed"]},"reviewNotes":{"type":["string","null"]},"createdAt":{"type":"string","format":"date-time"},"reviewedAt":{"type":["string","null"],"format":"date-time"}}};
const func46 = Object.prototype.hasOwnProperty;

function validate53(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ParticipationInquiry" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate53.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.userId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "userId"},message:"must have required property '"+"userId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.kind === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.interest === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "interest"},message:"must have required property '"+"interest"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.name === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.organization === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "organization"},message:"must have required property '"+"organization"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.message === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.status === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.reviewNotes === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "reviewNotes"},message:"must have required property '"+"reviewNotes"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.createdAt === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.reviewedAt === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "reviewedAt"},message:"must have required property '"+"reviewedAt"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
for(const key0 in data){
if(!(func46.call(schema82.properties, key0))){
const err11 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.id !== undefined){
if(typeof data.id !== "string"){
const err12 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.userId !== undefined){
if(typeof data.userId !== "string"){
const err13 = {instancePath:instancePath+"/userId",schemaPath:"#/properties/userId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.kind !== undefined){
let data2 = data.kind;
if(typeof data2 !== "string"){
const err14 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!((data2 === "general") || (data2 === "partnership"))){
const err15 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/enum",keyword:"enum",params:{allowedValues: schema82.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.interest !== undefined){
let data3 = data.interest;
if(typeof data3 === "string"){
if(func1(data3) > 80){
const err16 = {instancePath:instancePath+"/interest",schemaPath:"#/properties/interest/maxLength",keyword:"maxLength",params:{limit: 80},message:"must NOT have more than 80 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(func1(data3) < 2){
const err17 = {instancePath:instancePath+"/interest",schemaPath:"#/properties/interest/minLength",keyword:"minLength",params:{limit: 2},message:"must NOT have fewer than 2 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/interest",schemaPath:"#/properties/interest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.name !== undefined){
let data4 = data.name;
if(typeof data4 === "string"){
if(func1(data4) > 120){
const err19 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 120},message:"must NOT have more than 120 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(func1(data4) < 2){
const err20 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/minLength",keyword:"minLength",params:{limit: 2},message:"must NOT have fewer than 2 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.organization !== undefined){
let data5 = data.organization;
if((typeof data5 !== "string") && (data5 !== null)){
const err22 = {instancePath:instancePath+"/organization",schemaPath:"#/properties/organization/type",keyword:"type",params:{type: schema82.properties.organization.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.message !== undefined){
let data6 = data.message;
if(typeof data6 === "string"){
if(func1(data6) > 4000){
const err23 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/maxLength",keyword:"maxLength",params:{limit: 4000},message:"must NOT have more than 4000 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(func1(data6) < 10){
const err24 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/minLength",keyword:"minLength",params:{limit: 10},message:"must NOT have fewer than 10 characters"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.status !== undefined){
let data7 = data.status;
if(typeof data7 !== "string"){
const err26 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(!(((data7 === "pending") || (data7 === "reviewed")) || (data7 === "closed"))){
const err27 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema82.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.reviewNotes !== undefined){
let data8 = data.reviewNotes;
if((typeof data8 !== "string") && (data8 !== null)){
const err28 = {instancePath:instancePath+"/reviewNotes",schemaPath:"#/properties/reviewNotes/type",keyword:"type",params:{type: schema82.properties.reviewNotes.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data9 = data.createdAt;
if(typeof data9 === "string"){
if(!(formats0.validate(data9))){
const err29 = {instancePath:instancePath+"/createdAt",schemaPath:"#/properties/createdAt/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
else {
const err30 = {instancePath:instancePath+"/createdAt",schemaPath:"#/properties/createdAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data.reviewedAt !== undefined){
let data10 = data.reviewedAt;
if((typeof data10 !== "string") && (data10 !== null)){
const err31 = {instancePath:instancePath+"/reviewedAt",schemaPath:"#/properties/reviewedAt/type",keyword:"type",params:{type: schema82.properties.reviewedAt.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(typeof data10 === "string"){
if(!(formats0.validate(data10))){
const err32 = {instancePath:instancePath+"/reviewedAt",schemaPath:"#/properties/reviewedAt/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
}
}
else {
const err33 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
validate53.errors = vErrors;
return errors === 0;
}
validate53.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ParticipationResponse = validate54;
const schema83 = {"$id":"schema_ParticipationResponse","type":"object","additionalProperties":false,"required":["success","data"],"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"required":["inquiry"],"properties":{"inquiry":{"$ref":"gamo#/components/schemas/ParticipationInquiry"}}}}};
const schema84 = {"type":"object","additionalProperties":false,"required":["id","userId","kind","interest","name","organization","message","status","reviewNotes","createdAt","reviewedAt"],"properties":{"id":{"type":"string"},"userId":{"type":"string"},"kind":{"type":"string","enum":["general","partnership"]},"interest":{"type":"string","minLength":2,"maxLength":80},"name":{"type":"string","minLength":2,"maxLength":120},"organization":{"type":["string","null"]},"message":{"type":"string","minLength":10,"maxLength":4000},"status":{"type":"string","enum":["pending","reviewed","closed"]},"reviewNotes":{"type":["string","null"]},"createdAt":{"type":"string","format":"date-time"},"reviewedAt":{"type":["string","null"],"format":"date-time"}}};

function validate54(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ParticipationResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate54.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.inquiry === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "inquiry"},message:"must have required property '"+"inquiry"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(key1 === "inquiry")){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.inquiry !== undefined){
let data2 = data1.inquiry;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if(data2.id === undefined){
const err6 = {instancePath:instancePath+"/data/inquiry",schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data2.userId === undefined){
const err7 = {instancePath:instancePath+"/data/inquiry",schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "userId"},message:"must have required property '"+"userId"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data2.kind === undefined){
const err8 = {instancePath:instancePath+"/data/inquiry",schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data2.interest === undefined){
const err9 = {instancePath:instancePath+"/data/inquiry",schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "interest"},message:"must have required property '"+"interest"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data2.name === undefined){
const err10 = {instancePath:instancePath+"/data/inquiry",schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data2.organization === undefined){
const err11 = {instancePath:instancePath+"/data/inquiry",schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "organization"},message:"must have required property '"+"organization"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data2.message === undefined){
const err12 = {instancePath:instancePath+"/data/inquiry",schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data2.status === undefined){
const err13 = {instancePath:instancePath+"/data/inquiry",schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data2.reviewNotes === undefined){
const err14 = {instancePath:instancePath+"/data/inquiry",schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "reviewNotes"},message:"must have required property '"+"reviewNotes"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data2.createdAt === undefined){
const err15 = {instancePath:instancePath+"/data/inquiry",schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data2.reviewedAt === undefined){
const err16 = {instancePath:instancePath+"/data/inquiry",schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "reviewedAt"},message:"must have required property '"+"reviewedAt"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
for(const key2 in data2){
if(!(func46.call(schema84.properties, key2))){
const err17 = {instancePath:instancePath+"/data/inquiry",schemaPath:"gamo#/components/schemas/ParticipationInquiry/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data2.id !== undefined){
if(typeof data2.id !== "string"){
const err18 = {instancePath:instancePath+"/data/inquiry/id",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data2.userId !== undefined){
if(typeof data2.userId !== "string"){
const err19 = {instancePath:instancePath+"/data/inquiry/userId",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/userId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data2.kind !== undefined){
let data5 = data2.kind;
if(typeof data5 !== "string"){
const err20 = {instancePath:instancePath+"/data/inquiry/kind",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(!((data5 === "general") || (data5 === "partnership"))){
const err21 = {instancePath:instancePath+"/data/inquiry/kind",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/kind/enum",keyword:"enum",params:{allowedValues: schema84.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data2.interest !== undefined){
let data6 = data2.interest;
if(typeof data6 === "string"){
if(func1(data6) > 80){
const err22 = {instancePath:instancePath+"/data/inquiry/interest",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/interest/maxLength",keyword:"maxLength",params:{limit: 80},message:"must NOT have more than 80 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(func1(data6) < 2){
const err23 = {instancePath:instancePath+"/data/inquiry/interest",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/interest/minLength",keyword:"minLength",params:{limit: 2},message:"must NOT have fewer than 2 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/data/inquiry/interest",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/interest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data2.name !== undefined){
let data7 = data2.name;
if(typeof data7 === "string"){
if(func1(data7) > 120){
const err25 = {instancePath:instancePath+"/data/inquiry/name",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/name/maxLength",keyword:"maxLength",params:{limit: 120},message:"must NOT have more than 120 characters"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(func1(data7) < 2){
const err26 = {instancePath:instancePath+"/data/inquiry/name",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/name/minLength",keyword:"minLength",params:{limit: 2},message:"must NOT have fewer than 2 characters"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/data/inquiry/name",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data2.organization !== undefined){
let data8 = data2.organization;
if((typeof data8 !== "string") && (data8 !== null)){
const err28 = {instancePath:instancePath+"/data/inquiry/organization",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/organization/type",keyword:"type",params:{type: schema84.properties.organization.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data2.message !== undefined){
let data9 = data2.message;
if(typeof data9 === "string"){
if(func1(data9) > 4000){
const err29 = {instancePath:instancePath+"/data/inquiry/message",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/message/maxLength",keyword:"maxLength",params:{limit: 4000},message:"must NOT have more than 4000 characters"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(func1(data9) < 10){
const err30 = {instancePath:instancePath+"/data/inquiry/message",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/message/minLength",keyword:"minLength",params:{limit: 10},message:"must NOT have fewer than 10 characters"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
else {
const err31 = {instancePath:instancePath+"/data/inquiry/message",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data2.status !== undefined){
let data10 = data2.status;
if(typeof data10 !== "string"){
const err32 = {instancePath:instancePath+"/data/inquiry/status",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(!(((data10 === "pending") || (data10 === "reviewed")) || (data10 === "closed"))){
const err33 = {instancePath:instancePath+"/data/inquiry/status",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/status/enum",keyword:"enum",params:{allowedValues: schema84.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data2.reviewNotes !== undefined){
let data11 = data2.reviewNotes;
if((typeof data11 !== "string") && (data11 !== null)){
const err34 = {instancePath:instancePath+"/data/inquiry/reviewNotes",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/reviewNotes/type",keyword:"type",params:{type: schema84.properties.reviewNotes.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data2.createdAt !== undefined){
let data12 = data2.createdAt;
if(typeof data12 === "string"){
if(!(formats0.validate(data12))){
const err35 = {instancePath:instancePath+"/data/inquiry/createdAt",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/createdAt/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
else {
const err36 = {instancePath:instancePath+"/data/inquiry/createdAt",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/createdAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data2.reviewedAt !== undefined){
let data13 = data2.reviewedAt;
if((typeof data13 !== "string") && (data13 !== null)){
const err37 = {instancePath:instancePath+"/data/inquiry/reviewedAt",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/reviewedAt/type",keyword:"type",params:{type: schema84.properties.reviewedAt.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if(typeof data13 === "string"){
if(!(formats0.validate(data13))){
const err38 = {instancePath:instancePath+"/data/inquiry/reviewedAt",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/reviewedAt/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
}
}
else {
const err39 = {instancePath:instancePath+"/data/inquiry",schemaPath:"gamo#/components/schemas/ParticipationInquiry/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
}
else {
const err40 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
}
else {
const err41 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
validate54.errors = vErrors;
return errors === 0;
}
validate54.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ParticipationListResponse = validate55;
const schema85 = {"$id":"schema_ParticipationListResponse","type":"object","additionalProperties":false,"required":["success","data"],"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"required":["inquiries"],"properties":{"inquiries":{"type":"array","items":{"$ref":"gamo#/components/schemas/ParticipationInquiry"}}}}}};

function validate55(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ParticipationListResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate55.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.inquiries === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "inquiries"},message:"must have required property '"+"inquiries"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(key1 === "inquiries")){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.inquiries !== undefined){
let data2 = data1.inquiries;
if(Array.isArray(data2)){
const len0 = data2.length;
for(let i0=0; i0<len0; i0++){
let data3 = data2[i0];
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3.id === undefined){
const err6 = {instancePath:instancePath+"/data/inquiries/" + i0,schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data3.userId === undefined){
const err7 = {instancePath:instancePath+"/data/inquiries/" + i0,schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "userId"},message:"must have required property '"+"userId"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data3.kind === undefined){
const err8 = {instancePath:instancePath+"/data/inquiries/" + i0,schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data3.interest === undefined){
const err9 = {instancePath:instancePath+"/data/inquiries/" + i0,schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "interest"},message:"must have required property '"+"interest"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data3.name === undefined){
const err10 = {instancePath:instancePath+"/data/inquiries/" + i0,schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data3.organization === undefined){
const err11 = {instancePath:instancePath+"/data/inquiries/" + i0,schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "organization"},message:"must have required property '"+"organization"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data3.message === undefined){
const err12 = {instancePath:instancePath+"/data/inquiries/" + i0,schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data3.status === undefined){
const err13 = {instancePath:instancePath+"/data/inquiries/" + i0,schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data3.reviewNotes === undefined){
const err14 = {instancePath:instancePath+"/data/inquiries/" + i0,schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "reviewNotes"},message:"must have required property '"+"reviewNotes"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data3.createdAt === undefined){
const err15 = {instancePath:instancePath+"/data/inquiries/" + i0,schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data3.reviewedAt === undefined){
const err16 = {instancePath:instancePath+"/data/inquiries/" + i0,schemaPath:"gamo#/components/schemas/ParticipationInquiry/required",keyword:"required",params:{missingProperty: "reviewedAt"},message:"must have required property '"+"reviewedAt"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
for(const key2 in data3){
if(!(func46.call(schema84.properties, key2))){
const err17 = {instancePath:instancePath+"/data/inquiries/" + i0,schemaPath:"gamo#/components/schemas/ParticipationInquiry/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data3.id !== undefined){
if(typeof data3.id !== "string"){
const err18 = {instancePath:instancePath+"/data/inquiries/" + i0+"/id",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data3.userId !== undefined){
if(typeof data3.userId !== "string"){
const err19 = {instancePath:instancePath+"/data/inquiries/" + i0+"/userId",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/userId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data3.kind !== undefined){
let data6 = data3.kind;
if(typeof data6 !== "string"){
const err20 = {instancePath:instancePath+"/data/inquiries/" + i0+"/kind",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(!((data6 === "general") || (data6 === "partnership"))){
const err21 = {instancePath:instancePath+"/data/inquiries/" + i0+"/kind",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/kind/enum",keyword:"enum",params:{allowedValues: schema84.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data3.interest !== undefined){
let data7 = data3.interest;
if(typeof data7 === "string"){
if(func1(data7) > 80){
const err22 = {instancePath:instancePath+"/data/inquiries/" + i0+"/interest",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/interest/maxLength",keyword:"maxLength",params:{limit: 80},message:"must NOT have more than 80 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(func1(data7) < 2){
const err23 = {instancePath:instancePath+"/data/inquiries/" + i0+"/interest",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/interest/minLength",keyword:"minLength",params:{limit: 2},message:"must NOT have fewer than 2 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/data/inquiries/" + i0+"/interest",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/interest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data3.name !== undefined){
let data8 = data3.name;
if(typeof data8 === "string"){
if(func1(data8) > 120){
const err25 = {instancePath:instancePath+"/data/inquiries/" + i0+"/name",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/name/maxLength",keyword:"maxLength",params:{limit: 120},message:"must NOT have more than 120 characters"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(func1(data8) < 2){
const err26 = {instancePath:instancePath+"/data/inquiries/" + i0+"/name",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/name/minLength",keyword:"minLength",params:{limit: 2},message:"must NOT have fewer than 2 characters"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/data/inquiries/" + i0+"/name",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data3.organization !== undefined){
let data9 = data3.organization;
if((typeof data9 !== "string") && (data9 !== null)){
const err28 = {instancePath:instancePath+"/data/inquiries/" + i0+"/organization",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/organization/type",keyword:"type",params:{type: schema84.properties.organization.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data3.message !== undefined){
let data10 = data3.message;
if(typeof data10 === "string"){
if(func1(data10) > 4000){
const err29 = {instancePath:instancePath+"/data/inquiries/" + i0+"/message",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/message/maxLength",keyword:"maxLength",params:{limit: 4000},message:"must NOT have more than 4000 characters"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(func1(data10) < 10){
const err30 = {instancePath:instancePath+"/data/inquiries/" + i0+"/message",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/message/minLength",keyword:"minLength",params:{limit: 10},message:"must NOT have fewer than 10 characters"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
else {
const err31 = {instancePath:instancePath+"/data/inquiries/" + i0+"/message",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data3.status !== undefined){
let data11 = data3.status;
if(typeof data11 !== "string"){
const err32 = {instancePath:instancePath+"/data/inquiries/" + i0+"/status",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(!(((data11 === "pending") || (data11 === "reviewed")) || (data11 === "closed"))){
const err33 = {instancePath:instancePath+"/data/inquiries/" + i0+"/status",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/status/enum",keyword:"enum",params:{allowedValues: schema84.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data3.reviewNotes !== undefined){
let data12 = data3.reviewNotes;
if((typeof data12 !== "string") && (data12 !== null)){
const err34 = {instancePath:instancePath+"/data/inquiries/" + i0+"/reviewNotes",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/reviewNotes/type",keyword:"type",params:{type: schema84.properties.reviewNotes.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data3.createdAt !== undefined){
let data13 = data3.createdAt;
if(typeof data13 === "string"){
if(!(formats0.validate(data13))){
const err35 = {instancePath:instancePath+"/data/inquiries/" + i0+"/createdAt",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/createdAt/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
else {
const err36 = {instancePath:instancePath+"/data/inquiries/" + i0+"/createdAt",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/createdAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data3.reviewedAt !== undefined){
let data14 = data3.reviewedAt;
if((typeof data14 !== "string") && (data14 !== null)){
const err37 = {instancePath:instancePath+"/data/inquiries/" + i0+"/reviewedAt",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/reviewedAt/type",keyword:"type",params:{type: schema84.properties.reviewedAt.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if(typeof data14 === "string"){
if(!(formats0.validate(data14))){
const err38 = {instancePath:instancePath+"/data/inquiries/" + i0+"/reviewedAt",schemaPath:"gamo#/components/schemas/ParticipationInquiry/properties/reviewedAt/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
}
}
else {
const err39 = {instancePath:instancePath+"/data/inquiries/" + i0,schemaPath:"gamo#/components/schemas/ParticipationInquiry/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
}
else {
const err40 = {instancePath:instancePath+"/data/inquiries",schemaPath:"#/properties/data/properties/inquiries/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
}
else {
const err41 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
}
else {
const err42 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
validate55.errors = vErrors;
return errors === 0;
}
validate55.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_TermsDocumentRef = validate56;
const schema87 = {"$id":"schema_TermsDocumentRef","type":"object","additionalProperties":false,"properties":{"slug":{"type":"string","minLength":2,"maxLength":64},"version":{"type":"string","minLength":1,"maxLength":32}},"required":["slug","version"]};

function validate56(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_TermsDocumentRef" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate56.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.slug === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.version === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "slug") || (key0 === "version"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.slug !== undefined){
let data0 = data.slug;
if(typeof data0 === "string"){
if(func1(data0) > 64){
const err3 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(func1(data0) < 2){
const err4 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/minLength",keyword:"minLength",params:{limit: 2},message:"must NOT have fewer than 2 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.version !== undefined){
let data1 = data.version;
if(typeof data1 === "string"){
if(func1(data1) > 32){
const err6 = {instancePath:instancePath+"/version",schemaPath:"#/properties/version/maxLength",keyword:"maxLength",params:{limit: 32},message:"must NOT have more than 32 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(func1(data1) < 1){
const err7 = {instancePath:instancePath+"/version",schemaPath:"#/properties/version/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate56.errors = vErrors;
return errors === 0;
}
validate56.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ClerkSessionInput = validate57;
const schema88 = {"$id":"schema_ClerkSessionInput","type":"object","additionalProperties":false,"description":"Optional body of the Clerk token exchange; carries what the sign-up screen collected.","properties":{"intent":{"type":"string","enum":["signin","signup","recover"]},"role":{"type":"string","description":"Provider role chosen on the sign-up screen (sign-up only; must be one of this product's sign-up roles, otherwise ignored).","enum":["musician","technician","church","agent","organizer","teacher","artist"]},"terms":{"type":"array","maxItems":10,"items":{"$ref":"gamo#/components/schemas/TermsDocumentRef"}},"marketingOptIn":{"type":"boolean"}}};

function validate57(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ClerkSessionInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate57.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
for(const key0 in data){
if(!((((key0 === "intent") || (key0 === "role")) || (key0 === "terms")) || (key0 === "marketingOptIn"))){
const err0 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
if(data.intent !== undefined){
let data0 = data.intent;
if(typeof data0 !== "string"){
const err1 = {instancePath:instancePath+"/intent",schemaPath:"#/properties/intent/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(!(((data0 === "signin") || (data0 === "signup")) || (data0 === "recover"))){
const err2 = {instancePath:instancePath+"/intent",schemaPath:"#/properties/intent/enum",keyword:"enum",params:{allowedValues: schema88.properties.intent.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.role !== undefined){
let data1 = data.role;
if(typeof data1 !== "string"){
const err3 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(((((((data1 === "musician") || (data1 === "technician")) || (data1 === "church")) || (data1 === "agent")) || (data1 === "organizer")) || (data1 === "teacher")) || (data1 === "artist"))){
const err4 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/enum",keyword:"enum",params:{allowedValues: schema88.properties.role.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.terms !== undefined){
let data2 = data.terms;
if(Array.isArray(data2)){
if(data2.length > 10){
const err5 = {instancePath:instancePath+"/terms",schemaPath:"#/properties/terms/maxItems",keyword:"maxItems",params:{limit: 10},message:"must NOT have more than 10 items"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
const len0 = data2.length;
for(let i0=0; i0<len0; i0++){
let data3 = data2[i0];
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3.slug === undefined){
const err6 = {instancePath:instancePath+"/terms/" + i0,schemaPath:"gamo#/components/schemas/TermsDocumentRef/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data3.version === undefined){
const err7 = {instancePath:instancePath+"/terms/" + i0,schemaPath:"gamo#/components/schemas/TermsDocumentRef/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key1 in data3){
if(!((key1 === "slug") || (key1 === "version"))){
const err8 = {instancePath:instancePath+"/terms/" + i0,schemaPath:"gamo#/components/schemas/TermsDocumentRef/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data3.slug !== undefined){
let data4 = data3.slug;
if(typeof data4 === "string"){
if(func1(data4) > 64){
const err9 = {instancePath:instancePath+"/terms/" + i0+"/slug",schemaPath:"gamo#/components/schemas/TermsDocumentRef/properties/slug/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(func1(data4) < 2){
const err10 = {instancePath:instancePath+"/terms/" + i0+"/slug",schemaPath:"gamo#/components/schemas/TermsDocumentRef/properties/slug/minLength",keyword:"minLength",params:{limit: 2},message:"must NOT have fewer than 2 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/terms/" + i0+"/slug",schemaPath:"gamo#/components/schemas/TermsDocumentRef/properties/slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data3.version !== undefined){
let data5 = data3.version;
if(typeof data5 === "string"){
if(func1(data5) > 32){
const err12 = {instancePath:instancePath+"/terms/" + i0+"/version",schemaPath:"gamo#/components/schemas/TermsDocumentRef/properties/version/maxLength",keyword:"maxLength",params:{limit: 32},message:"must NOT have more than 32 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(func1(data5) < 1){
const err13 = {instancePath:instancePath+"/terms/" + i0+"/version",schemaPath:"gamo#/components/schemas/TermsDocumentRef/properties/version/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/terms/" + i0+"/version",schemaPath:"gamo#/components/schemas/TermsDocumentRef/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
else {
const err15 = {instancePath:instancePath+"/terms/" + i0,schemaPath:"gamo#/components/schemas/TermsDocumentRef/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath:instancePath+"/terms",schemaPath:"#/properties/terms/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.marketingOptIn !== undefined){
if(typeof data.marketingOptIn !== "boolean"){
const err17 = {instancePath:instancePath+"/marketingOptIn",schemaPath:"#/properties/marketingOptIn/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
else {
const err18 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
validate57.errors = vErrors;
return errors === 0;
}
validate57.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ClerkWebhookEvent = validate58;
const schema90 = {"$id":"schema_ClerkWebhookEvent","type":"object","description":"Clerk webhook payload (only type and data.id are read).","additionalProperties":true,"properties":{"type":{"type":"string","maxLength":100},"data":{"type":"object","additionalProperties":true}},"required":["type"]};

function validate58(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ClerkWebhookEvent" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate58.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.type === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.type !== undefined){
let data0 = data.type;
if(typeof data0 === "string"){
if(func1(data0) > 100){
const err1 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/maxLength",keyword:"maxLength",params:{limit: 100},message:"must NOT have more than 100 characters"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
else {
const err2 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
}
else {
const err3 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
validate58.errors = vErrors;
return errors === 0;
}
validate58.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ClerkWebhookResponse = validate59;
const schema91 = {"$id":"schema_ClerkWebhookResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"received":{"const":true},"status":{"type":"string","enum":["revoked","ignored"]},"sessionsRevoked":{"type":"integer","minimum":0}},"required":["received","status","sessionsRevoked"]}},"required":["success","data"]};

function validate59(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ClerkWebhookResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate59.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.received === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "received"},message:"must have required property '"+"received"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.status === undefined){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1.sessionsRevoked === undefined){
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "sessionsRevoked"},message:"must have required property '"+"sessionsRevoked"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key1 in data1){
if(!(((key1 === "received") || (key1 === "status")) || (key1 === "sessionsRevoked"))){
const err7 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.received !== undefined){
if(true !== data1.received){
const err8 = {instancePath:instancePath+"/data/received",schemaPath:"#/properties/data/properties/received/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data1.status !== undefined){
let data3 = data1.status;
if(typeof data3 !== "string"){
const err9 = {instancePath:instancePath+"/data/status",schemaPath:"#/properties/data/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(!((data3 === "revoked") || (data3 === "ignored"))){
const err10 = {instancePath:instancePath+"/data/status",schemaPath:"#/properties/data/properties/status/enum",keyword:"enum",params:{allowedValues: schema91.properties.data.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data1.sessionsRevoked !== undefined){
let data4 = data1.sessionsRevoked;
if(!((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4)))){
const err11 = {instancePath:instancePath+"/data/sessionsRevoked",schemaPath:"#/properties/data/properties/sessionsRevoked/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(typeof data4 == "number"){
if(data4 < 0 || isNaN(data4)){
const err12 = {instancePath:instancePath+"/data/sessionsRevoked",schemaPath:"#/properties/data/properties/sessionsRevoked/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
}
else {
const err13 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
validate59.errors = vErrors;
return errors === 0;
}
validate59.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_PersonLinkForm = validate60;
const schema92 = {"$id":"schema_PersonLinkForm","type":"object","additionalProperties":false,"properties":{"action":{"type":"string","enum":["unlink","link"]}},"required":["action"]};

function validate60(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_PersonLinkForm" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate60.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.action === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(key0 === "action")){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.action !== undefined){
let data0 = data.action;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(!((data0 === "unlink") || (data0 === "link"))){
const err3 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/enum",keyword:"enum",params:{allowedValues: schema92.properties.action.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
validate60.errors = vErrors;
return errors === 0;
}
validate60.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ProviderAccountForm = validate61;
const schema93 = {"$id":"schema_ProviderAccountForm","type":"object","description":"Onboarding form fields. Besides the listed controls, a save carries the step's own fields (role-specific, validated server-side by the step schema) as plain strings.","additionalProperties":{"type":"string","maxLength":4000},"properties":{"action":{"type":"string","enum":["start","save","terms","submit","publish","unpublish"]},"role":{"type":"string","enum":["musician","technician","church","agent","organizer","teacher","artist"]},"step":{"type":"string","maxLength":40},"terms_slug":{"type":"string","maxLength":64},"terms_version":{"type":"string","maxLength":32},"terms_accept":{"type":"string","enum":["yes"]}},"required":["action","role"]};

function validate61(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ProviderAccountForm" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate61.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.action === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.role === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "role"},message:"must have required property '"+"role"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "action") || (key0 === "role")) || (key0 === "step")) || (key0 === "terms_slug")) || (key0 === "terms_version")) || (key0 === "terms_accept"))){
let data0 = data[key0];
if(typeof data0 === "string"){
if(func1(data0) > 4000){
const err2 = {instancePath:instancePath+"/" + key0.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/additionalProperties/maxLength",keyword:"maxLength",params:{limit: 4000},message:"must NOT have more than 4000 characters"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
else {
const err3 = {instancePath:instancePath+"/" + key0.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
if(data.action !== undefined){
let data1 = data.action;
if(typeof data1 !== "string"){
const err4 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!((((((data1 === "start") || (data1 === "save")) || (data1 === "terms")) || (data1 === "submit")) || (data1 === "publish")) || (data1 === "unpublish"))){
const err5 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/enum",keyword:"enum",params:{allowedValues: schema93.properties.action.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.role !== undefined){
let data2 = data.role;
if(typeof data2 !== "string"){
const err6 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!(((((((data2 === "musician") || (data2 === "technician")) || (data2 === "church")) || (data2 === "agent")) || (data2 === "organizer")) || (data2 === "teacher")) || (data2 === "artist"))){
const err7 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/enum",keyword:"enum",params:{allowedValues: schema93.properties.role.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.step !== undefined){
let data3 = data.step;
if(typeof data3 === "string"){
if(func1(data3) > 40){
const err8 = {instancePath:instancePath+"/step",schemaPath:"#/properties/step/maxLength",keyword:"maxLength",params:{limit: 40},message:"must NOT have more than 40 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/step",schemaPath:"#/properties/step/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.terms_slug !== undefined){
let data4 = data.terms_slug;
if(typeof data4 === "string"){
if(func1(data4) > 64){
const err10 = {instancePath:instancePath+"/terms_slug",schemaPath:"#/properties/terms_slug/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/terms_slug",schemaPath:"#/properties/terms_slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.terms_version !== undefined){
let data5 = data.terms_version;
if(typeof data5 === "string"){
if(func1(data5) > 32){
const err12 = {instancePath:instancePath+"/terms_version",schemaPath:"#/properties/terms_version/maxLength",keyword:"maxLength",params:{limit: 32},message:"must NOT have more than 32 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/terms_version",schemaPath:"#/properties/terms_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.terms_accept !== undefined){
let data6 = data.terms_accept;
if(typeof data6 !== "string"){
const err14 = {instancePath:instancePath+"/terms_accept",schemaPath:"#/properties/terms_accept/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!(data6 === "yes")){
const err15 = {instancePath:instancePath+"/terms_accept",schemaPath:"#/properties/terms_accept/enum",keyword:"enum",params:{allowedValues: schema93.properties.terms_accept.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate61.errors = vErrors;
return errors === 0;
}
validate61.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ProviderReviewForm = validate62;
const schema94 = {"$id":"schema_ProviderReviewForm","type":"object","additionalProperties":false,"properties":{"action":{"type":"string","enum":["schedule_meeting","start_review","verify","request_changes","reject","suspend","reinstate"]},"expected_status":{"type":"string","maxLength":40},"notes":{"type":"string","maxLength":2000},"meeting_at":{"type":"string","description":"Local date and time (YYYY-MM-DDTHH:MM) in meeting_zone.","maxLength":20},"meeting_zone":{"type":"string","description":"IANA time zone of meeting_at (default America/Phoenix).","maxLength":64},"meeting_location":{"type":"string","maxLength":300},"meeting_staff":{"type":"string","maxLength":120}},"required":["action","expected_status"]};

function validate62(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ProviderReviewForm" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate62.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.action === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.expected_status === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "expected_status"},message:"must have required property '"+"expected_status"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "action") || (key0 === "expected_status")) || (key0 === "notes")) || (key0 === "meeting_at")) || (key0 === "meeting_zone")) || (key0 === "meeting_location")) || (key0 === "meeting_staff"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.action !== undefined){
let data0 = data.action;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(((((((data0 === "schedule_meeting") || (data0 === "start_review")) || (data0 === "verify")) || (data0 === "request_changes")) || (data0 === "reject")) || (data0 === "suspend")) || (data0 === "reinstate"))){
const err4 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/enum",keyword:"enum",params:{allowedValues: schema94.properties.action.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.expected_status !== undefined){
let data1 = data.expected_status;
if(typeof data1 === "string"){
if(func1(data1) > 40){
const err5 = {instancePath:instancePath+"/expected_status",schemaPath:"#/properties/expected_status/maxLength",keyword:"maxLength",params:{limit: 40},message:"must NOT have more than 40 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/expected_status",schemaPath:"#/properties/expected_status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.notes !== undefined){
let data2 = data.notes;
if(typeof data2 === "string"){
if(func1(data2) > 2000){
const err7 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.meeting_at !== undefined){
let data3 = data.meeting_at;
if(typeof data3 === "string"){
if(func1(data3) > 20){
const err9 = {instancePath:instancePath+"/meeting_at",schemaPath:"#/properties/meeting_at/maxLength",keyword:"maxLength",params:{limit: 20},message:"must NOT have more than 20 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/meeting_at",schemaPath:"#/properties/meeting_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.meeting_zone !== undefined){
let data4 = data.meeting_zone;
if(typeof data4 === "string"){
if(func1(data4) > 64){
const err11 = {instancePath:instancePath+"/meeting_zone",schemaPath:"#/properties/meeting_zone/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/meeting_zone",schemaPath:"#/properties/meeting_zone/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.meeting_location !== undefined){
let data5 = data.meeting_location;
if(typeof data5 === "string"){
if(func1(data5) > 300){
const err13 = {instancePath:instancePath+"/meeting_location",schemaPath:"#/properties/meeting_location/maxLength",keyword:"maxLength",params:{limit: 300},message:"must NOT have more than 300 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/meeting_location",schemaPath:"#/properties/meeting_location/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.meeting_staff !== undefined){
let data6 = data.meeting_staff;
if(typeof data6 === "string"){
if(func1(data6) > 120){
const err15 = {instancePath:instancePath+"/meeting_staff",schemaPath:"#/properties/meeting_staff/maxLength",keyword:"maxLength",params:{limit: 120},message:"must NOT have more than 120 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/meeting_staff",schemaPath:"#/properties/meeting_staff/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate62.errors = vErrors;
return errors === 0;
}
validate62.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ResendEvent = validate63;
const schema95 = {"$id":"schema_ResendEvent","type":"object","additionalProperties":true,"description":"Resend webhook payload (Svix-signed).","properties":{"type":{"type":"string"},"created_at":{"type":"string"},"data":{"type":"object","additionalProperties":true}},"required":["type","data"]};

function validate63(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ResendEvent" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate63.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.type === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.type !== undefined){
if(typeof data.type !== "string"){
const err2 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.created_at !== undefined){
if(typeof data.created_at !== "string"){
const err3 = {instancePath:instancePath+"/created_at",schemaPath:"#/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data2 = data.data;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
}
else {
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
validate63.errors = vErrors;
return errors === 0;
}
validate63.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ResendWebhookResponse = validate64;
const schema96 = {"$id":"schema_ResendWebhookResponse","type":"object","additionalProperties":false,"properties":{"received":{"const":true},"applied":{"type":"boolean"}},"required":["received","applied"]};

function validate64(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ResendWebhookResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate64.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.received === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "received"},message:"must have required property '"+"received"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.applied === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "applied"},message:"must have required property '"+"applied"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "received") || (key0 === "applied"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.received !== undefined){
if(true !== data.received){
const err3 = {instancePath:instancePath+"/received",schemaPath:"#/properties/received/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.applied !== undefined){
if(typeof data.applied !== "boolean"){
const err4 = {instancePath:instancePath+"/applied",schemaPath:"#/properties/applied/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
validate64.errors = vErrors;
return errors === 0;
}
validate64.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};
