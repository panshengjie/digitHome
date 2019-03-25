FROM ubuntu:18.04
MAINTAINER panda panshengjie1@126.com

RUN apt-get update
RUN apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash -
RUN apt-get install -y nodejs cuetools shntool flac imagemagick enca wavpack

WORKDIR /homeDigit
COPY package*.json ./

RUN npm i -g cnpm --registry=https://registry.npm.taobao.org; cnpm i

COPY . .

EXPOSE 8080
CMD ["npm", "start"]
